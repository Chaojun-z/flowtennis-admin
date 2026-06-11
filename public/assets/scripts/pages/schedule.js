// ===== 排课表 =====
function onScheduleFilterChange(){schPage=standardListFirstPage();renderSchedule();}
function syncScheduleFilterOptions(){
  const statusValue=document.getElementById('schStatusFilter')?.value||'';
  const coachValue=document.getElementById('schCoachFilter')?.value||'';
  const courseTypeValue=document.getElementById('schCourseTypeFilter')?.value||'';
  const baseRows=schedules.filter(s=>(campus==='all'||sameCampusValue(s.campus,campus))&&globalDateWithinRange(s.startTime));
  const coachNames=[...new Set([...activeCoachNames(),...schedules.map(s=>coachName(s.coach)).filter(Boolean)])];
  const linked=withLinkedFilterCounts([
    {key:'status',value:statusValue,options:[{value:'',label:'全部',emptyDisplay:'状态'},{value:'已排课',label:'待上课'},{value:'已结束',label:'已下课'},{value:'已取消',label:'已取消'}],match:(s,value)=>effectiveScheduleStatus(s)===value},
    {key:'coach',value:coachValue,options:[{value:'',label:'全部',emptyDisplay:'教练'},...coachNames.map(name=>({value:name,label:name}))],match:(s,value)=>coachName(s.coach)===value},
    {key:'courseType',value:courseTypeValue,options:[{value:'',label:'全部',emptyDisplay:'课程类型'},...STANDARD_COURSE_TYPE_OPTIONS],match:(s,value)=>standardCourseTypeFilterValue(s)===value}
  ],baseRows);
  [['schStatusFilterHost','schStatusFilter','状态',linked.status.options,linked.status.value],['schCoachFilterHost','schCoachFilter','教练',linked.coach.options,linked.coach.value],['schCourseTypeFilterHost','schCourseTypeFilter','课程类型',linked.courseType.options,linked.courseType.value]].forEach(([hostId,id,label,options,value])=>{
    const host=document.getElementById(hostId);
    if(host)host.innerHTML=renderStandardDropdownHtml(id,label,options,value,false,'onScheduleFilterChange');
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
function scheduleLocationDetailParts(s){
  if(isExternalSchedule(s)){
    const parts=scheduleExternalVenueParts(s);
    return {type:'校区外',place:parts.name||'校区外',court:parts.court||''};
  }
  return {type:'校区内',place:cn(s?.campus)||s?.campus||'',court:s?.venue||''};
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
function renderSchedulePagerControls(total,pages){
  const pageSizeHost=document.getElementById('schPageSize');
  if(pageSizeHost)pageSizeHost.innerHTML=renderPageSizeSelectorHtml('schPageSizeValue',schPageSize,'setSchedulePageSize');
  const btns=document.getElementById('schPagerBtns');
  if(!btns)return;
  btns.innerHTML=(!total||pages<=1)?'':renderStandardPaginationButtonsHtml(schPage,pages,'setSchedulePage');
}
function setSchedulePage(value){
  const total=getFilteredSchedules().length;
  schPage=standardListPagination(total,value,schPageSize).page;
  renderSchedule();
}
function setSchedulePageSize(value){
  schPageSize=standardListPageSize(value,schPageSize);
  schPage=standardListFirstPage();
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
    if(!globalDateWithinRange(s.startTime))return false;
    if(sf&&effectiveStatus!==sf)return false;
    if(coachFilter&&coachName(s.coach)!==coachFilter)return false;
    if(tf&&standardCourseTypeFilterValue(s)!==tf)return false;
    return true;
  }).map(s=>({...s,_effectiveStatus:effectiveScheduleStatus(s,now)}));
}
function jumpSchedulePage(value){
  const total=getFilteredSchedules().length;
  schPage=standardListPagination(total,value,schPageSize).page;
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
  const pageState=standardListSlice(list,schPage,schPageSize);
  schPage=pageState.page;
  const {total,pages,slice}=pageState;
  const pager=document.querySelector('#page-schedule .tms-pagination');
  if(pager)pager.style.display=total?'flex':'none';
  document.getElementById('schPagerInfo').innerHTML=renderPagerInfoHtml(total);
  renderSchedulePagerControls(total,pages);
  document.getElementById('schTbody').innerHTML=slice.length?slice.map(s=>{
    const fb=scheduleFeedback(s);
    const status=s._effectiveStatus||effectiveScheduleStatus(s);
    const isCancelled=status==='已取消';
    const dateText=String(s.startTime||'').slice(0,10)||'—';
    const timeText=s.startTime?`${s.startTime.slice(11,16)}-${(s.endTime||'').slice(11,16)}`:'—';
    return `<tr><td class="tms-sticky-l" style="padding-left:14px">${renderStandardCellText(dateText,false)}</td><td>${renderStandardCellText(timeText,false)}</td><td>${renderStandardCellText(scheduleDurationText(s),false)}</td><td><div class="tms-cell-text" title="${esc(s.externalNotes||scheduleLocationText(s))}">${esc(scheduleLocationText(s))}</div></td><td>${renderStandardCellText(coachName(s.coach),false)}</td><td><div class="tms-text-primary">${esc(scheduleListStudentSummary(s))}</div></td><td><span class="tms-tag ${productTypeTagClass(scheduleCourseType(s))}">${esc(scheduleCourseTypeLabel(s))}</span></td><td>${renderStandardCellText(scheduleRepeatDisplayText(s),false)}</td><td><span class="tms-action-link" onclick="openFeedbackModal('${s.id}')">${scheduleFeedbackStatusText(s)}</span></td><td><span class="tms-tag ${scheduleStatusTagClass(status)}">${scheduleStatusLabel(status)}</span>${status==='已取消'&&s.cancelReason?`<div class="tms-text-secondary" style="margin-top:6px">${esc(s.cancelReason)}</div>`:''}</td><td class="tms-sticky-r tms-action-cell schedule-action-cell"><span class="tms-action-link" onclick="openScheduleDetail('${s.id}')">查看</span>${isCancelled?`<span class="tms-action-link" onclick="confirmDel('${s.id}','误建排课','schedule')">删除</span>`:`<span class="tms-action-link" onclick="openCancelScheduleModal('${s.id}')">取消</span>`}</td></tr>`;
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
function scheduleStudentDisplayName(student){
  return String(student?.name||student?.studentName||student?.displayName||student?.nickName||student?.nickname||'').trim();
}
function scheduleStudentPhone(student){
  return String(student?.phone||student?.mobile||student?.studentPhone||'').trim();
}
function scheduleStudentSearchTokens(student){
  return [scheduleStudentDisplayName(student),scheduleStudentPhone(student),cn(student?.campus),student?.campus].filter(Boolean);
}
function scheduleStudentInlineMeta(student){
  const campus=cn(student?.campus)||'未设校区';
  const last=scheduleStudentLastLessonBrief(student);
  return `${campus}｜${last}上课`;
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
  return renderStandardDropdownHtml('sch_venue','场地',venueOptions,nextValue,true);
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
  refreshScheduleDeductionLabel();
  refreshSchEntitlementOptions();
}
function refreshScheduleDeductionLabel(){
  const label=document.getElementById('sch_lc_label');
  if(label)label.textContent='消课时数';
  refreshScheduleCountFields();
}
function syncScheduleHomeCampusFromStudents(ids,applyDefault=true){
  const meta=scheduleSelectedStudentHomeCampusMeta(ids);
  const summary=document.getElementById('sch_homeCampusSummary');
  if(summary)summary.textContent=meta.text;
  if(applyDefault&&meta.campus&&(document.getElementById('sch_locationType')?.value||'own')==='own'){
    setStandardDropdownValue('sch_campus',meta.campus,cn(meta.campus)||meta.campus);
    syncScheduleVenueField();
  }
}
function syncScheduleProfileFromStudents(ids,applyDefault=true){
  syncScheduleHomeCampusFromStudents(ids,applyDefault);
  const meta=scheduleSelectedStudentCoachMeta(ids);
  if(applyDefault&&meta.coach){const selectedCoach=coachName(meta.coach);setStandardDropdownValue('sch_coach',selectedCoach,selectedCoach);}
}
function renderScheduleStudentTags(selectedIds=[]){
  const picked=new Set(parseArr(selectedIds));
  const rows=students.filter(s=>picked.has(s.id));
  if(!rows.length)return '';
  return rows.map(s=>`<span class="schedule-student-tag">${esc(scheduleStudentDisplayName(s)||s.id)} <span>${esc(scheduleStudentInlineMeta(s))}</span><button type="button" onclick="removeScheduleStudent(${jsArg(s.id)})">×</button></span>`).join('');
}
function scheduleSelectedStudentSearchText(ids=[]){
  const picked=new Set(parseArr(ids));
  return students.filter(s=>picked.has(s.id)).map(scheduleStudentDisplayName).filter(Boolean).join(',');
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
  const pickedMatches=students.filter(s=>picked.has(s.id)&&scheduleStudentSearchTokens(s).some(v=>String(v||'').toLowerCase().includes(q)));
  const rows=students.filter(s=>{
    if(picked.has(s.id))return false;
    return scheduleStudentSearchTokens(s).some(v=>String(v||'').toLowerCase().includes(q));
  }).sort((a,b)=>String(scheduleStudentDisplayName(a)||'').localeCompare(String(scheduleStudentDisplayName(b)||''),'zh-CN')).slice(0,8);
  if(!rows.length)return pickedMatches.length?'':'<div class="schedule-student-suggest-empty">没有匹配到学员</div>';
  return `<div class="schedule-student-suggest-list">${rows.map(s=>`<button type="button" onclick="selectScheduleStudent(${jsArg(s.id)})">${esc(scheduleStudentDisplayName(s)||s.id)} ${esc(scheduleStudentInlineMeta(s))}</button>`).join('')}</div>`;
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
  refreshScheduleStoredValueHint();
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
  const ownCourt=document.getElementById('sch_ownCourtRow');
  const externalCourt=document.getElementById('sch_externalCourtRow');
  const placeLabel=document.getElementById('sch_locationPlaceLabel');
  if(own)own.style.display=type==='external'?'none':'flex';
  if(external)external.style.display=type==='external'?'flex':'none';
  if(ownCourt)ownCourt.style.display=type==='external'?'none':'flex';
  if(externalCourt)externalCourt.style.display=type==='external'?'flex':'none';
  if(placeLabel)placeLabel.textContent=type==='external'?'场馆名称':'上课校区';
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
  setStandardDropdownValue('sch_endTime',end,end);
  refreshScheduleTimeDerivedFields();
}
function scheduleEntitlementLabel(option){
  if(!option?.entitlementId)return option?.label||'自动匹配可用课包';
  const title=standardPackageLabel(option,true)||option.packageName||'课包';
  const unit=packageLessonUnitLabel(option);
  return [title,`剩余${option.remainingLessons}/${option.totalLessons}${unit}`,scheduleEntitlementTimeBandText(option,title),scheduleEntitlementExpiryText(option)].filter(Boolean).join(' · ');
}
function scheduleEntitlementTimeBandText(option,title=''){
  const text=packageTimeBandShortLabel(option?.timeBand||'全天');
  return text&&!String(title||'').includes(text)?text:'';
}
function scheduleEntitlementExpiryText(option){
  const validUntil=String(option?.validUntil||'').trim();
  return validUntil&&validUntil!=='-'?`到期${validUntil}`:'';
}
function renderScheduleEntitlementDropdown(options=[],value='',placeholder='自动匹配可用课包'){
  const list=options.length?options.map(x=>({value:x.entitlementId,label:scheduleEntitlementLabel(x)})):[{value:'',label:placeholder}];
  return renderStandardDropdownHtml('sch_entitlement','扣减课包',list,value,true,'handleScheduleEntitlementChange');
}
function setScheduleEntitlementDropdown(options=[],value='',placeholder='自动匹配可用课包'){
  const host=document.getElementById('sch_entitlementHost');
  const keep=document.getElementById('sch_entitlement')?.dataset.keep||'';
  if(host)host.innerHTML=renderScheduleEntitlementDropdown(options,value,placeholder);
  const input=document.getElementById('sch_entitlement');
  if(input&&keep)input.dataset.keep=keep;
  refreshScheduleCountFields();
}
function renderScheduleStudentEntitlementRows(options=[],ids=[]){
  const picked=parseArr(ids).filter(Boolean);
  if(picked.length<=1)return '';
  return `<div class="schedule-student-entitlement-list">${picked.map(studentId=>{
    const student=students.find(s=>s.id===studentId)||{};
    const name=scheduleStudentDisplayName(student)||studentId;
    const rows=(options||[]).filter(option=>String(option.studentId||'')===String(studentId));
    const selected=rows.find(option=>option.selectable);
    const text=selected?scheduleEntitlementLabel(selected):scheduleEntitlementUnavailableReason(rows);
    return `<div class="schedule-student-entitlement-row ${selected?'':'is-missing'}" title="${esc(`${name}：${text}`)}"><span class="schedule-student-entitlement-name">${esc(name)}</span><span class="schedule-student-entitlement-package">${esc(text)}</span></div>`;
  }).join('')}</div>`;
}
function refreshScheduleStudentEntitlementRows(res={},ids=[]){
  const host=document.getElementById('sch_studentEntitlementRows');
  if(!host)return;
  const options=Array.isArray(res?.options)?res.options:[];
  host.innerHTML=renderScheduleStudentEntitlementRows(options,ids);
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
  refreshScheduleCountFields();
  refreshSchEntitlementOptions();
}
function handleScheduleExperienceTypeChange(){
  syncScheduleExperienceType();
  refreshScheduleCountFields();
  refreshSchEntitlementOptions();
}
function scheduleCourseTypePartsFromStandard(value=''){
  const [courseTypeRaw,level2Raw='']=String(value||'').split('/').map(part=>part.trim());
  const courseType=normalizeCourseType(courseTypeRaw);
  const level2=String(level2Raw||'').trim();
  return {
    courseType,
    experienceType:courseType==='体验课'?normalizeExperienceType(level2,'私教体验课'):'',
    smallClassType:courseType==='小班课'?({单次:'single',训练营:'bootcamp',随到随学:'dropin'})[level2]||'single':''
  };
}
function setScheduleCourseTypeFields(courseType,experienceType='',smallClassType=''){
  const normalized=normalizeCourseType(courseType||'')||PRODUCT_TYPES[0];
  const exp=normalized==='体验课'?normalizeExperienceType(experienceType,'私教体验课'):'';
  const small=normalized==='小班课'?(smallClassType||'single'):'';
  const courseInput=document.getElementById('sch_courseType');
  const expInput=document.getElementById('sch_experienceType');
  const smallInput=document.getElementById('sch_smallClassType');
  if(courseInput)courseInput.value=normalized;
  if(expInput)expInput.value=exp;
  if(smallInput)smallInput.value=small;
  const standard=standardCourseTypeLabel(normalized,exp,small);
  const standardInput=document.getElementById('sch_standardCourseType');
  const dropdown=document.getElementById('sch_standardCourseType_dropdown');
  if(standardInput)standardInput.value=standard;
  if(dropdown){
    const display=dropdown.querySelector('.tms-dropdown-display');
    if(display)display.textContent=standard;
    dropdown.classList.toggle('has-value',!!standard);
    dropdown.querySelectorAll('.tms-dropdown-item').forEach(el=>el.classList.toggle('active',String(el.dataset.value||'')===standard));
    dropdown.classList.remove('open');
  }
}
function handleScheduleStandardCourseTypeChange(){
  const parts=scheduleCourseTypePartsFromStandard(document.getElementById('sch_standardCourseType')?.value||'');
  setScheduleCourseTypeFields(parts.courseType,parts.experienceType,parts.smallClassType);
  syncScheduleExperienceType();
  syncScheduleSmallClassType();
  refreshScheduleTimeDerivedFields();
  refreshScheduleCountFields();
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
function scheduleStoredValuePaymentState(){
  const studentIds=parseArr(document.getElementById('sch_stuIds')?.value||'[]');
  const amount=parseFloat(document.getElementById('sch_paidAmount')?.value||'0')||0;
  const payMethod=document.getElementById('sch_payMethod')?.value||'';
  if(currentScheduleSettlementType()!=='direct'||!isStoredValuePayMethod(payMethod))return {active:false};
  if(!studentIds.length)return {active:true,valid:false,message:'请选择学员后查看储值卡余额'};
  if(studentIds.length>1)return {active:true,valid:false,message:'储值卡扣款请只选择 1 名学员'};
  const student=students.find(s=>s.id===studentIds[0]);
  const court=courtsForStudent(student)[0]||null;
  if(!court)return {active:true,valid:false,message:'未找到该学员的会员储值卡'};
  const balance=courtFinanceLocal(court).balance||0;
  const after=Math.round((balance-amount)*100)/100;
  if(amount>0&&after<0)return {active:true,valid:false,balance,amount,after,message:`余额不足，当前储值卡余额：¥${fmt(balance)}，本次需扣 ¥${fmt(amount)}`};
  return {active:true,valid:true,balance,amount,after,message:amount>0?`当前储值卡余额：¥${fmt(balance)}，本次扣款 ¥${fmt(amount)}，扣后余额 ¥${fmt(after)}`:`当前储值卡余额：¥${fmt(balance)}`};
}
function refreshScheduleStoredValueHint(){
  const hint=document.getElementById('sch_storedValueHint');
  if(!hint)return;
  const state=scheduleStoredValuePaymentState();
  hint.classList.toggle('is-error',state.active&&!state.valid);
  if(!state.active){hint.style.display='none';hint.textContent='';return;}
  hint.style.display='block';
  hint.textContent=state.message||'';
}
function toggleScheduleSettlementFields(){
  const type=currentScheduleSettlementType();
  const packageItem=document.getElementById('sch_packageSettlementItem');
  const directFields=document.getElementById('sch_directPaymentFields');
  const row=document.querySelector('.schedule-settlement-row');
  if(row)row.classList.toggle('is-direct',type==='direct');
  if(packageItem)packageItem.style.display=type==='direct'?'none':'';
  if(directFields)directFields.style.display=type==='direct'?'contents':'none';
  if(type!=='package'){setScheduleCourseTypeReadonly(false);setScheduleSmallClassTypeReadonly(false);}
  refreshScheduleCountFields();
  refreshSchEntitlementOptions();
  refreshScheduleFieldFeeFields();
  refreshScheduleStoredValueHint();
}
// schedule modal field ids: id="sch_date" id="sch_startTime" id="sch_endTime" id="sch_cancelReason" id="sch_scheduleSource"
function openScheduleModal(id,seed={}){
  editId=id;
  const s=id?schedules.find(x=>x.id===id):(seed||null);
  const courseTypeForm=normalizeCourseTypeForForm(s||seed);
  const courseTypeOptions=STANDARD_COURSE_TYPE_OPTIONS;
  const coachOptions=[{value:'',label:'— 选择 —'},...activeCoachNames().map(c=>({value:c,label:c}))];
  const campusOptions=[{value:'',label:'— 选择 —'},...campuses.map(c=>({value:c.code||c.id,label:campusOptionLabel(c)}))];
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
  const hiddenFields=`<input type="hidden" id="sch_stuIds" value="${rv(s,'studentIds','[]')}"><input type="hidden" id="sch_expectedStuIds" value="${esc(JSON.stringify(expectedStudentIds))}"><input type="hidden" id="sch_scheduleSource" value="${scheduleSource}"><input type="hidden" id="sch_status" value="${rv(s,'status','已排课')}"><input type="hidden" id="sch_cancelReason" value="${esc(rv(s,'cancelReason'))}">`;
  const drawerActions=`<div class="schedule-detail-card-actions"><button type="button" class="schedule-detail-action muted" onclick="${id?`openScheduleDetail('${s.id}')`:'closeModal()'}">取消</button><button type="button" class="schedule-detail-action primary" id="scheduleSaveBtn" onclick="saveSchedule()">保存修改</button></div>`;
  const fieldFeeChecked=!!s?.requiresFieldFee&&parseFloat(s?.fieldFeeAmount)>0;
  const fieldFeeSection=`<div class="schedule-field-fee-section" id="sch_fieldFeeFields" style="display:none"><div class="tms-form-row schedule-field-fee-main-row"><div class="tms-form-item schedule-field-fee-toggle"><label class="tms-form-label">是否收补差</label><div class="finput tms-form-control schedule-field-fee-toggle-control"><input type="checkbox" class="tms-checkbox" id="sch_fieldFeeEnabled" ${fieldFeeChecked?'checked':''} onchange="refreshScheduleFieldFeeFields()"><span>非黄金课包排入黄金时段补差</span></div></div><div class="tms-form-item schedule-field-fee-amount"><label class="tms-form-label">补差金额</label><input class="finput tms-form-control" id="sch_fieldFeeAmount" type="number" min="0" step="0.01" value="${rv(s,'fieldFeeAmount','')}" placeholder="补差金额"></div><div class="tms-form-item schedule-field-fee-pay"><label class="tms-form-label">支付方式</label>${renderStandardDropdownHtml('sch_fieldFeePayMethod','支付方式',courseSurchargePayMethodOptions(),rv(s,'fieldFeePayMethod','微信'),true)}</div></div><div class="tms-form-row schedule-field-fee-note-row"><div class="tms-form-item full-width"><label class="tms-form-label">补差说明</label><textarea class="finput tms-form-control schedule-field-fee-note" id="sch_fieldFeeNote" placeholder="非黄金课包排入黄金时段补差">${esc(rv(s,'fieldFeeNote','非黄金课包排入黄金时段补差'))}</textarea></div></div></div>`;
  const settlementField=`<div class="tms-form-item schedule-settlement-type-item"><label class="tms-form-label">结算方式</label><div class="schedule-settlement-controls"><div class="schedule-settlement-select">${renderStandardDropdownHtml('sch_settlementType','结算方式',settlementOptions,settlementType,true,'toggleScheduleSettlementFields')}</div><div class="schedule-direct-payment-item" id="sch_directPaymentFields" style="display:none">${renderStandardDropdownHtml('sch_payMethod','支付方式',payMethodOptions(),rv(s,'payMethod','微信'),true,'refreshScheduleStoredValueHint')}<div class="schedule-direct-payment-amount"><input class="finput tms-form-control" id="sch_paidAmount" type="number" min="0" step="0.01" value="${rv(s,'paidAmount','')}" placeholder="支付金额" oninput="refreshScheduleStoredValueHint()"><div id="sch_storedValueHint" class="schedule-stored-value-hint"></div></div></div></div></div>`;
  const packageField=`<div class="tms-form-item schedule-entitlement-item" id="sch_packageSettlementItem"><label class="tms-form-label">扣减课包</label><div id="sch_entitlementHost">${renderScheduleEntitlementDropdown([],rv(s,'entitlementId',''),rv(s,'packageName','自动匹配可用课包')||'自动匹配可用课包')}</div><div id="sch_studentEntitlementRows"></div><div id="sch_ent_hint" class="schedule-entitlement-alert"></div></div>`;
  const repeatField=`<div class="tms-form-item schedule-repeat-field"><label class="tms-form-label">循环排课</label><label class="schedule-checkbox-line schedule-repeat-control ${id?'is-disabled':''}"><input type="checkbox" class="tms-checkbox" id="sch_repeatEnabled" ${s?.scheduleSource==='循环排课'?'checked':''} ${id?'disabled':''} onchange="toggleScheduleRepeatWeeks()"><span>每周循环</span></label>${id?'<div class="schedule-repeat-help">批量排课不支持编辑</div>':''}</div><div class="tms-form-item schedule-repeat-weeks-field" id="sch_repeatWeeksWrap" style="display:none"><label class="tms-form-label">循环周数</label><input class="finput tms-form-control" id="sch_repeatWeeks" type="number" min="1" max="12" value="1" ${id?'disabled':''}></div>`;
  const basicForm=`<input type="hidden" id="sch_courseType" value="${esc(courseTypeForm.courseType||PRODUCT_TYPES[0])}"><input type="hidden" id="sch_smallClassType" value="${esc(smallClassType)}"><input type="hidden" id="sch_experienceType" value="${esc(scheduleExperienceType)}"><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">学员姓名</label><input class="finput tms-form-control" id="sch_stuSearch" placeholder="搜索姓名 / 手机号" oninput="updateScheduleStudentSearch()" autocomplete="off"><div id="sch_studentSuggest" class="schedule-student-suggest"></div><div id="sch_selectedStudentTags" class="schedule-student-tags">${renderScheduleStudentTags(selectedStudentIds)}</div></div><div class="tms-form-item schedule-course-type-item"><label class="tms-form-label">课程类型</label>${renderStandardDropdownHtml('sch_standardCourseType','课程类型',courseTypeOptions,courseTypeForm.standardCourseType||standardCourseTypeLabel(courseTypeForm.courseType,courseTypeForm.experienceType,courseTypeForm.smallClassType),true,'handleScheduleStandardCourseTypeChange')}</div></div><div class="tms-form-row schedule-settlement-row">${settlementField}${packageField}</div><div class="tms-form-row schedule-time-row"><div class="tms-form-item schedule-time-field"><label class="tms-form-label">上课时间</label>${scheduleTimeRangeControls(dateValue,startTimeValue,endTimeValue)}</div><div class="tms-form-item schedule-lesson-count-item"><label class="tms-form-label" id="sch_lc_label">消课时数</label><div class="schedule-lesson-count-controls"><input class="finput tms-form-control" id="sch_lc" type="number" step="0.5" value="${rv(s,'lessonCount',seed.lessonCount||1)}" onchange="refreshSchEntitlementOptions()"><div id="sch_countItem" style="display:none"><input class="finput tms-form-control" id="sch_count" type="number" value="1" readonly></div></div></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">上课教练</label>${renderStandardDropdownHtml('sch_coach','上课教练',coachOptions,coachName(rv(s,'coach')||seed.coach),true,'handleScheduleCoachChange')}</div><div class="tms-form-item schedule-location-type"><label class="tms-form-label">地点类型</label>${renderStandardDropdownHtml('sch_locationType','地点类型',[{value:'own',label:'校区内'},{value:'external',label:'校区外'}],locationType,true,'toggleScheduleLocationType')}</div></div><div class="tms-form-row schedule-location-row"><div class="tms-form-item"><label class="tms-form-label" id="sch_locationPlaceLabel">${locationType==='external'?'场馆名称':'上课校区'}</label><div class="schedule-location-fields" id="sch_ownLocationRow">${renderStandardDropdownHtml('sch_campus','上课校区',campusOptions,locationType==='own'?(rv(s,'campus')||seed.campus):'',true,'handleScheduleCampusChange')}</div><div class="schedule-location-fields" id="sch_externalLocationRow" style="display:none"><input class="finput tms-form-control" id="sch_externalVenueName" value="${esc(externalParts.name)}" placeholder="例：奥森网球中心"></div></div><div class="tms-form-item"><label class="tms-form-label">场地</label><div class="schedule-location-fields" id="sch_ownCourtRow"><div id="sch_venueFieldHost">${renderScheduleVenueField(locationType==='own'?(rv(s,'campus')||seed.campus):'',locationType==='own'?rv(s,'venue','1号场'):'1号场')}</div></div><div class="schedule-location-fields" id="sch_externalCourtRow" style="display:none"><input class="finput tms-form-control" id="sch_externalCourtName" value="${esc(externalParts.court)}" placeholder="例：A1 / 学员自订"><input type="hidden" id="sch_externalNotes" value="${esc(rv(s,'externalNotes'))}"></div></div></div><div class="tms-form-row schedule-repeat-row">${repeatField}</div>${fieldFeeSection}`;
  const lateSettings=`<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">是否迟到</label><label class="schedule-checkbox-line schedule-late-free-control"><input type="checkbox" class="tms-checkbox" id="sch_coachLateFree" ${lateChecked?'checked':''} onchange="refreshScheduleLateFee()"><span>是，本节课不扣学员课时</span></label></div><div class="tms-form-item"><label class="tms-form-label">迟到原因</label><input class="finput tms-form-control" id="sch_lateReason" value="${esc(rv(s,'lateReason'))}" placeholder="例如：教练迟到，本节课免费"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">迟到时长</label><input class="finput tms-form-control" id="sch_lateMinutes" type="number" min="0" value="${parseInt(rv(s,'lateMinutes',0))||0}"></div><div class="tms-form-item"><label class="tms-form-label">需承担场地费用</label><input class="finput tms-form-control" id="sch_lateFieldFee" type="number" min="0" value="${parseFloat(rv(s,'coachLateFieldFeeAmount',0))||0}"></div></div>`;
  const studentNotesText=selectedStudentIds.map(id=>students.find(st=>st.id===id)?.notes).filter(Boolean).join('；')||'--';
  const notesForm=`<div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">学员备注</label><div class="finput tms-form-control schedule-detail-readonly-control schedule-student-notes-preview" title="${esc(studentNotesText)}">${esc(studentNotesText)}</div></div></div><div class="tms-form-row schedule-notes-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">排课备注</label><textarea class="finput tms-form-control" id="sch_notes">${esc(rv(s,'notes'))}</textarea></div></div>`;
  const body=`${hiddenFields}${renderScheduleDetailFormCard('基础信息',basicForm,drawerActions)}${renderScheduleDetailFormCard('设置迟到',lateSettings)}${renderScheduleDetailFormCard('备注信息',notesForm)}`;
  const headerHtml=id&&s?scheduleDetailHeaderHtml(s,scheduleStudentSummary(s)):scheduleDetailCreateHeaderHtml(seed);
  openStandardDetailDrawer({
    titleHtml:`${headerHtml}${scheduleDetailTabsHtml('info',{create:!id})}`,
    bodyHtml:`<div class="schedule-detail-content">${body}</div>`,
    actionsHtml:'',
    data:{scheduleDetailId:id||''},
    overlayClasses:['schedule-drawer-overlay'],
    modalClass:'modal modal-court modal-schedule-drawer'
  });
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
  const body=`<div class="schedule-cancel-summary"><div>${esc(fmtDt(s.startTime))}</div><div>${esc(scheduleListStudentSummary(s))}</div><div>${esc(coachName(s.coach)||'—')}</div><div>${esc(scheduleLocationText(s))}</div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">取消原因 *</label>${renderStandardDropdownHtml('sch_cancelReasonQuick','取消原因',[{value:'',label:'— 选择取消原因 —'},...SCH_CANCEL_REASONS.map(t=>({value:t,label:t}))],'',true)}</div></div>${repeatBlock}`;
  const drawerActions=`<div class="schedule-drawer-form-actions"><button type="button" class="schedule-detail-action muted" onclick="openScheduleDetail('${s.id}')">返回</button><button type="button" class="schedule-detail-action danger" id="scheduleCancelBtn" onclick="confirmScheduleCancel('${s.id}')">确认取消</button></div>`;
  openStandardDetailDrawer({
    titleHtml:`<div class="schedule-drawer-form-head"><div><div class="schedule-detail-title">取消排课</div><div class="schedule-detail-subtitle">${esc([fmtDt(s.startTime),scheduleLocationText(s)].filter(Boolean).join(' · '))}</div></div>${drawerActions}</div>`,
    bodyHtml:`<div class="schedule-detail-content schedule-detail-form">${body}</div>`,
    actionsHtml:'',
    data:{scheduleDetailId:s.id},
    overlayClasses:['schedule-drawer-overlay'],
    modalClass:'modal modal-court modal-schedule-drawer'
  });
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
  if(prod?.type)setStandardDropdownValue('sch_courseType',prod.type,prod.type);
  if(prod?.experienceType)setStandardDropdownValue('sch_experienceType',prod.experienceType,prod.experienceType);
  syncScheduleExperienceType();
  if(cls.coach){const classCoach=coachName(cls.coach);setStandardDropdownValue('sch_coach',classCoach,classCoach);}
  if(cls.campus)setStandardDropdownValue('sch_campus',cls.campus,cn(cls.campus)||cls.campus);
  syncScheduleVenueField();
  setStandardDropdownValue('sch_locationType','own','校区内');
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
  (result?.courts||[]).forEach(c=>{const i=courts.findIndex(x=>x.id===c.id);if(i>=0)courts[i]=c;else courts.unshift(c);});
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
function setScheduleEntitlementAlert(hint,message=''){
  if(!hint)return;
  const text=String(message||'').trim();
  hint.innerHTML=text?`<span class="schedule-entitlement-alert-icon">!</span><span>${esc(text)}</span>`:'';
  hint.style.display=text?'flex':'none';
}
function applySchEntitlementOptions(res,preferredId=''){
  const sel=document.getElementById('sch_entitlement');
  const hint=document.getElementById('sch_ent_hint');
  if(!sel||!hint)return;
  refreshScheduleStudentEntitlementRows({},[]);
  const options=(res.options||[]).filter(x=>x.selectable);
  if(!options.length&&maybeSwitchScheduleCourseFromUnavailableEntitlement(res.options||[]))return;
  schEntitlementOptionCache.clear();
  options.forEach(option=>{if(option.entitlementId)schEntitlementOptionCache.set(option.entitlementId,option);});
  const maxRemain=options.reduce((best,item)=>(Number(item.remainingLessons)||0)>(Number(best?.remainingLessons)||0)?item:best,null);
  const selected=options.find(x=>preferredId&&x.entitlementId===preferredId)||maxRemain;
  setScheduleEntitlementDropdown(options,selected?.entitlementId||'',options.length?'自动匹配可用课包':'无可用课包');
  setScheduleCoachFromEntitlement(selected);
  const courseType=scheduleEntitlementCourseType(selected);
  if(courseType){
    const experienceType=scheduleEntitlementExperienceType(selected);
    const smallClassType=courseType==='小班课'?scheduleEntitlementSmallClassType(selected):'';
    setScheduleCourseTypeFields(courseType,experienceType,smallClassType);
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
  const hintText=selected?'':scheduleEntitlementUnavailableReason(res.options||[]);
  hint.innerHTML=hintText?`<span class="schedule-entitlement-alert-icon">!</span><span>${esc(hintText)}</span>`:'';
  hint.style.display=hintText?'flex':'none';
  refreshScheduleCountFields();
  refreshScheduleFieldFeeFields();
}
function applyScheduleMultiStudentEntitlementOptions(res,ids=[]){
  const hint=document.getElementById('sch_ent_hint');
  setScheduleEntitlementDropdown([], '', '按学员自动匹配课包');
  setScheduleCourseTypeReadonly(false);
  setScheduleSmallClassTypeReadonly(false);
  refreshScheduleStudentEntitlementRows(res,ids);
  const options=res.options||[];
  const missing=parseArr(ids).filter(studentId=>!options.some(option=>String(option.studentId||'')===String(studentId)&&option.selectable));
  const names=missing.map(studentId=>scheduleStudentDisplayName(students.find(s=>s.id===studentId))||studentId).join('、');
  setScheduleEntitlementAlert(hint,names?`${names} 没有可用课包`:'');
  refreshScheduleCountFields();
  refreshScheduleFieldFeeFields();
}
function maybeSwitchScheduleCourseFromUnavailableEntitlement(items=[]){
  const option=(items||[]).find(item=>{
    const warnings=item.warnings||[];
    return !item.selectable&&item.courseType&&warnings.some(text=>/课程类型不匹配|体验课类型不匹配|小班课类型不匹配/.test(text));
  });
  if(!option)return false;
  const nextCourseType=normalizeCourseType(option.courseType||'');
  const nextExperienceType=nextCourseType==='体验课'?normalizeExperienceType(option.experienceType||option.packageName,''):'';
  const nextSmallClassType=nextCourseType==='小班课'?scheduleEntitlementSmallClassType(option):'';
  const currentCourseType=normalizeCourseType(document.getElementById('sch_courseType')?.value||'');
  const currentExperienceType=currentCourseType==='体验课'?normalizeExperienceType(document.getElementById('sch_experienceType')?.value,''):'';
  const currentSmallClassType=currentCourseType==='小班课'?(document.getElementById('sch_smallClassType')?.value||'single'):'';
  if(currentCourseType===nextCourseType&&currentExperienceType===nextExperienceType&&currentSmallClassType===(nextSmallClassType||currentSmallClassType))return false;
  if(nextCourseType)setScheduleCourseTypeFields(nextCourseType,nextExperienceType,nextSmallClassType);
  syncScheduleExperienceType();
  syncScheduleSmallClassType();
  setScheduleCourseTypeReadonly(false);
  setScheduleSmallClassTypeReadonly(false);
  setTimeout(()=>refreshSchEntitlementOptions(),0);
  return true;
}
function handleScheduleCoachChange(){
  const input=document.getElementById('sch_coach');
  if(input)input.dataset.userChanged='1';
  refreshSchEntitlementOptions();
}
function setScheduleCoachFromEntitlement(option){
  const input=document.getElementById('sch_coach');
  if(!input||input.dataset.userChanged==='1'||window.editScheduleId)return;
  const owner=coachName(option?.ownerCoach||'');
  if(owner)setStandardDropdownValue('sch_coach',owner,owner);
}
function scheduleSelectedEntitlementOption(){
  const id=document.getElementById('sch_entitlement')?.value||'';
  if(!id)return null;
  return schEntitlementOptionCache.get(id)||entitlements.find(x=>x.id===id)||null;
}
function scheduleEntitlementCountUnit(option){
  if(!option)return '';
  const local=entitlements.find(e=>e.id===option.entitlementId||e.id===option.id)||{};
  return packageLessonUnitLabel({
    ...local,
    ...option,
    courseType:option.courseType||local.courseType||local.type||'',
    experienceType:option.experienceType||local.experienceType||option.packageName||local.packageName||''
  });
}
function scheduleSelectedEntitlementUsesCount(){
  if(currentScheduleSettlementType()!=='package')return false;
  const selected=scheduleSelectedEntitlementOption();
  if(selected)return scheduleEntitlementCountUnit(selected)==='次';
  const courseType=normalizeCourseType(document.getElementById('sch_courseType')?.value||'');
  const experienceType=courseType==='体验课'?normalizeExperienceType(document.getElementById('sch_experienceType')?.value,''):'';
  return packageLessonUnitLabel({courseType,experienceType})==='次';
}
function refreshScheduleCountFields(){
  const item=document.getElementById('sch_countItem');
  const input=document.getElementById('sch_count');
  const lessonInput=document.getElementById('sch_lc');
  const label=document.getElementById('sch_lc_label');
  const show=scheduleSelectedEntitlementUsesCount();
  if(label)label.textContent=show?'消课次数':'消课时数';
  if(lessonInput)lessonInput.style.display=show?'none':'';
  if(item)item.style.display=show?'':'none';
  if(input)input.value=show?'1':'';
}
function scheduleCurrentLessonCount(){
  return parseFloat(document.getElementById(scheduleSelectedEntitlementUsesCount()?'sch_count':'sch_lc')?.value)||1;
}
function scheduleNeedsFieldFeeUi(){
  if(currentScheduleSettlementType()!=='package')return false;
  return !!scheduleSelectedEntitlementOption()?.requiresFieldFee;
}
function refreshScheduleFieldFeeFields(){
  const wrap=document.getElementById('sch_fieldFeeFields');
  if(!wrap)return;
  const needed=scheduleNeedsFieldFeeUi();
  wrap.style.display=needed?'block':'none';
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
  const dropdown=document.getElementById('sch_standardCourseType_dropdown');
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
    const experienceType=scheduleEntitlementExperienceType({entitlementId:sel.value});
    const smallClassType=courseType==='小班课'?scheduleEntitlementSmallClassType({entitlementId:sel.value}):'';
    setScheduleCourseTypeFields(courseType,experienceType,smallClassType);
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
  refreshScheduleCountFields();
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
    lessonCount:scheduleCurrentLessonCount(),
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
  openStandardModal({title:'迟到月结',bodyHtml:body,actionsHtml:'<button class="tms-btn tms-btn-primary" onclick="closeModal()">关闭</button>',extraClass:'modal-wide late-settlement-modal'});
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
    setScheduleEntitlementAlert(hint);
    refreshScheduleStudentEntitlementRows({},[]);
    setScheduleCourseTypeReadonly(false);
    setScheduleSmallClassTypeReadonly(false);
    return;
  }
  const ids=parseArr(document.getElementById('sch_stuIds')?.value||'[]');
  const startRaw=scheduleComposeDateTime('sch_date','sch_startTime');
  const endRaw=scheduleComposeDateTime('sch_date','sch_endTime');
  if(!ids.length||!startRaw||!endRaw){setScheduleEntitlementDropdown([], '', '自动匹配可用课包');setScheduleEntitlementAlert(hint);refreshScheduleStudentEntitlementRows({},[]);setScheduleCourseTypeReadonly(false);setScheduleSmallClassTypeReadonly(false);return;}
  const keepValue=sel.dataset.keep||sel.value||'';
  const editId=window.editScheduleId||'';
  const payload={
    ...readSchEntitlementPayload(ids,startRaw,endRaw),
    lessonCount:scheduleCurrentLessonCount(),
    scheduleId:editId||''
  };
  const cacheKey=scheduleEntitlementCacheKey(payload);
  const cached=schEntitlementCache.get(cacheKey);
  const now=Date.now();
  if(cached&&(now-cached.at)<30000){
    if(ids.length>1)applyScheduleMultiStudentEntitlementOptions(cached.value,ids);
    else applySchEntitlementOptions(cached.value,keepValue);
    return;
  }
  clearTimeout(schEntitlementRefreshTimer);
  const refreshSeq=++schEntitlementRefreshSeq;
  setScheduleEntitlementDropdown([], '', ids.length>1?'正在匹配学员课包':'正在重新计算可用课包');
  refreshScheduleStudentEntitlementRows({},[]);
  hint.textContent='正在匹配可用课包…';
  schEntitlementRefreshTimer=setTimeout(async ()=>{
    try{
      const res=await apiCall('POST','/entitlements/recommend',payload);
      schEntitlementCache.set(cacheKey,{at:Date.now(),value:res});
      trimSchEntitlementCache();
      if(refreshSeq!==schEntitlementRefreshSeq)return;
      if(ids.length>1)applyScheduleMultiStudentEntitlementOptions(res,ids);
      else applySchEntitlementOptions(res,keepValue);
    }catch(e){
      if(refreshSeq!==schEntitlementRefreshSeq)return;
      setScheduleEntitlementDropdown([], '', '无可用课包');
      refreshScheduleStudentEntitlementRows({},[]);
      setScheduleCourseTypeReadonly(false);
      setScheduleSmallClassTypeReadonly(false);
      hint.textContent=e.message;
    }
  },300);
}
function scheduleSaveConfirmText(data,selectedEntitlement){
  const absent=parseArr(data.absentStudentIds);
  const packageText=data.settlementType==='direct'?`${data.payMethod} ¥${fmt(data.paidAmount||0)}`:data.settlementType==='gift'?'赠送/免费，收入 ¥0':(data.studentIds.length>1?'按每个学员的可用课包自动扣课':(selectedEntitlement?(standardPackageLabel(selectedEntitlement,true)||selectedEntitlement.packageName):'未选择可用课包，本次不会扣减课包余额'));
  const chargeLabel=scheduleSaveChargeLabel(data);
  const chargeText=scheduleSaveChargeText(data,selectedEntitlement);
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
    <div class="schedule-confirm-charge"><span class="schedule-confirm-label">${esc(chargeLabel)}</span><span class="schedule-confirm-charge-value">${esc(chargeText)}</span></div>
    ${data.requiresFieldFee?row('补差价',data.fieldFeeAmount>0?`${data.fieldFeePayMethod} ¥${fmt(data.fieldFeeAmount)}`:(data.fieldFeeReason||'需补差价/场地费'),'schedule-confirm-warn'):''}
    ${data.coachLateFree?row('迟到免费',`本节不扣学员课时，教练承担场地费 ¥${fmt(data.coachLateFieldFeeAmount||0)}`,'schedule-confirm-warn'):''}
    ${data.status==='已取消'?row('取消原因',data.cancelReason||'未填写','schedule-confirm-warn'):''}
  </div>`;
}
function scheduleSaveChargeLabel(data={}){
  const settlementType=data?.settlementType||'package';
  if(settlementType==='direct'||settlementType==='gift'||scheduleCourseType(data)==='陪打')return '本次服务';
  return '本次扣课';
}
function scheduleSaveChargeText(data={},selectedEntitlement=null){
  if(data.coachLateFree)return '本次不扣课';
  if(scheduleSaveChargeLabel(data)==='本次服务')return `${lessonUnitsText(data.lessonCount||0)} 小时`;
  const chargeUnit=scheduleSaveChargeUnit(data,selectedEntitlement);
  return `${data.lessonCount||0} ${chargeUnit}`;
}
function scheduleSaveChargeUnit(data={},selectedEntitlement=null){
  if(scheduleCourseType(data)==='小班课')return '次';
  return packageBalanceUnitLabel({...selectedEntitlement,courseType:data.courseType||selectedEntitlement?.courseType,experienceType:data.experienceType||selectedEntitlement?.experienceType});
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
  const lc=scheduleCurrentLessonCount();
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
  if(settlementType==='direct'&&isStoredValuePayMethod(payMethod)){
    const storedValueState=scheduleStoredValuePaymentState();
    refreshScheduleStoredValueHint();
    if(!storedValueState.valid){toast(storedValueState.after<0?'储值卡余额不足':(storedValueState.message||'储值卡余额不足'),'warn');return;}
  }
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
  if(btn){btn.disabled=false;btn.textContent='保存修改';}
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
    knowledgePoint:feedback?.knowledgePoint||'',
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
  String(text).split(pattern).filter(Boolean).forEach(part=>groups.push({text:part,highlight:false}));
}
function posterNormalizeText(text,options={}){
  const raw=String(text||'—');
  const preserveListMarkers=options.preserveListMarkers;
  if(preserveListMarkers===false){
    return raw.split('\n').map(line=>line.replace(/^\s*(?:\d+[\.\、][\s\t]*|[·•\-－][\s\t]*)/,'')).join('\n')||'—';
  }
  return raw;
}
function posterTextGroups(text,options={}){
  const raw=posterNormalizeText(text,options);
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
function posterTextLines(ctx,text,maxWidth,maxLines=Number.MAX_SAFE_INTEGER,options={}){
  const lines=[[]];
  posterTextGroups(text,options).forEach(group=>{
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
function posterDrawFittedTitle(ctx,text,x,y,maxWidth,maxFont,minFont,color){
  let fontSize=maxFont;
  const value=String(text||'学员');
  ctx.fillStyle=color;
  while(fontSize>minFont){
    ctx.font=`900 ${fontSize}px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif`;
    if(ctx.measureText(value).width<=maxWidth)break;
    fontSize-=2;
  }
  ctx.font=`900 ${fontSize}px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif`;
  let finalText=value;
  if(ctx.measureText(finalText).width>maxWidth){
    finalText=value;
    while(finalText.length>1&&ctx.measureText(`${finalText}…`).width>maxWidth)finalText=finalText.slice(0,-1);
    finalText=`${finalText}…`;
  }
  ctx.fillText(finalText,x,y);
}
function posterBlockHeight(lineCount){
  const paddingTop=32,paddingBottom=54,titleSpace=52,lineHeight=48;
  const safeCount=Math.max(1,Number(lineCount)||1);
  return paddingTop+titleSpace+(safeCount-1)*lineHeight+paddingBottom;
}
function posterSectionHasContent(text){
  const value=String(text||'').trim();
  return !!value&&value!=='—';
}
function measureFeedbackPosterLayout(ctx,data){
  const contentWidth=570;
  const gap=28;
  const startY=320;
  const textOptions={preserveListMarkers:data.preserveListMarkers!==false};
  const practicedLines=posterTextLines(ctx,data.practicedToday,contentWidth,Number.MAX_SAFE_INTEGER,textOptions);
  const practicedHeight=posterBlockHeight(practicedLines.length);
  let nextY=startY+practicedHeight+gap;
  let knowledge=null;
  if(posterSectionHasContent(data.knowledgePoint)){
    const knowledgeLines=posterTextLines(ctx,data.knowledgePoint,contentWidth,Number.MAX_SAFE_INTEGER,textOptions);
    const knowledgeHeight=posterBlockHeight(knowledgeLines.length);
    knowledge={y:nextY,lines:knowledgeLines,boxHeight:knowledgeHeight};
    nextY+=knowledgeHeight+gap;
  }else{
    knowledge=null;
  }
  const nextTrainingY=nextY;
  const nextTrainingLines=posterTextLines(ctx,data.nextTraining,contentWidth,Number.MAX_SAFE_INTEGER,textOptions);
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
    knowledge,
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
  posterDrawFittedTitle(ctx,nameStr,60,140,630,68,46,tpl.nameColor||tpl.ink);
  ctx.fillStyle=tpl.type==='cleanSilhouette'?(tpl.subColor||tpl.muted):tpl.accent;
  ctx.font='700 26px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
  ctx.fillText(`${posterDisplayDate(data.date)} 训练反馈`,60,195);
  if(!['sport','diagonalSplit','split'].includes(tpl.type)){ctx.fillStyle=tpl.subColor||tpl.muted;ctx.globalAlpha=.3;ctx.fillRect(60,235,630,2);ctx.globalAlpha=1;}
  posterDrawTextBlock(ctx,tpl,'今天练习了',90,layout.practiced.y,layout.contentWidth,layout.practiced.lines,layout.practiced.boxHeight);
  if(layout.knowledge)posterDrawTextBlock(ctx,tpl,'练习情况',90,layout.knowledge.y,layout.contentWidth,layout.knowledge.lines,layout.knowledge.boxHeight);
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
  const preserve=document.getElementById('posterPreserveListMarkers');
  if(preserve)feedbackPosterState.data.preserveListMarkers=preserve.checked;
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
  feedbackPosterState={scheduleId:s.id,feedbackId:fb.id,templateKey:'blueGreenDiagonal',data:{...feedbackPosterData(s,fb),preserveListMarkers:true}};
  const buttons=Object.entries(FEEDBACK_POSTER_TEMPLATES).map(([key,t])=>`<button class="poster-template-btn${key==='blueGreenDiagonal'?' active':''}" data-poster-template="${key}" onclick="renderFeedbackPosterPreview('${key}')">${esc(t.name)}</button>`).join('');
  const body=`<div class="poster-mobile-shell"><div class="poster-template-row">${buttons}</div><label class="poster-list-toggle"><input type="checkbox" id="posterPreserveListMarkers" checked onchange="renderFeedbackPosterPreview(feedbackPosterState?.templateKey||'blueGreenDiagonal')">保留序号/项目符号</label><canvas id="feedbackPosterCanvas" class="feedback-poster-canvas" width="750" height="1334"></canvas><img id="feedbackPosterImage" class="feedback-poster-image" alt="课后反馈海报"><div class="poster-save-tip">电脑点“下载图片”会保存 PNG；手机若没有下载入口，请长按海报图片保存。</div></div>`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="openFeedbackModal('${s.id}')">返回反馈</button><button class="tms-btn tms-btn-default" id="posterDownloadBtn" onclick="downloadFeedbackPoster()">下载图片</button><button class="tms-btn tms-btn-primary" id="posterShareBtn" onclick="shareFeedbackPoster()">分享图片</button>`;
  openStandardModal({title:'生成课后海报',bodyHtml:body,actionsHtml:footer,extraClass:'modal-tight'});
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
function isSmallGroupSchedule(s){
  return scheduleCourseType(s)==='小班课'||normalizeExperienceType(s?.experienceType||'','')==='小班体验课';
}
function scheduleCoachProposal(s){
  return coachProposals.find(p=>String(p.scheduleId||'')===String(s?.id||''))||null;
}
function isCoachPortalUser(){
  return currentUser?.role==='editor'&&!!currentUser?.coachName;
}
function coachProposalSummaryHtml(p){
  if(!p)return '<span class="detail-feedback-pending">未提交</span>';
  const rows=[
    ['课程名称',p.courseName],
    ['学员级别',p.studentLevel],
    ['学员数量',p.studentCount],
    ['教学目标',p.teachingGoal],
    ['进阶1',p.progression1],
    ['进阶2',p.progression2],
    ['进阶3',p.progression3],
    ['进阶逻辑',p.progressionLogic],
    ['结语',p.conclusion],
    ['提交时间',p.submittedAt?fmtDt(p.submittedAt):'']
  ];
  return `<div class="tms-detail-grid">${rows.map(([label,value])=>studentDetailBlockHtml(label,esc(renderStandardEmptyText(value)),{hideEmpty:false})).join('')}</div>`;
}
function proposalValue(p,key,fallback=''){
  return esc(p?.[key]??fallback??'');
}
function openCoachProposalModal(scheduleId){
  const s=schedules.find(x=>x.id===scheduleId);if(!s)return;
  if(!isSmallGroupSchedule(s)){toast('只有小班课需要填写教练提案','warn');return;}
  const p=scheduleCoachProposal(s)||{};
  const studentCount=parseArr(s.studentIds).length||p.studentCount||'';
  const body=`<div class="tms-section-header" style="margin-top:0;">教练提案</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">课程名称 *</label><input class="finput tms-form-control" id="cp_courseName" value="${proposalValue(p,'courseName',s.className||s.productName||'小班课')}"></div><div class="tms-form-item"><label class="tms-form-label">学员级别 *</label><input class="finput tms-form-control" id="cp_studentLevel" value="${proposalValue(p,'studentLevel')}" placeholder="例：1.5-2.0"></div><div class="tms-form-item"><label class="tms-form-label">学员数量 *</label><input class="finput tms-form-control" id="cp_studentCount" type="number" min="1" value="${proposalValue(p,'studentCount',studentCount)}"></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">教学目标 *</label><textarea class="finput tms-form-control" id="cp_teachingGoal">${proposalValue(p,'teachingGoal')}</textarea></div></div><div class="tms-section-header">教学组织 · 3级进阶</div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">进阶1 *</label><textarea class="finput tms-form-control" id="cp_progression1">${proposalValue(p,'progression1')}</textarea></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">进阶2 *</label><textarea class="finput tms-form-control" id="cp_progression2">${proposalValue(p,'progression2')}</textarea></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">进阶3 *</label><textarea class="finput tms-form-control" id="cp_progression3">${proposalValue(p,'progression3')}</textarea></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">进阶逻辑 *</label><textarea class="finput tms-form-control" id="cp_progressionLogic">${proposalValue(p,'progressionLogic')}</textarea></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">结语 *</label><textarea class="finput tms-form-control" id="cp_conclusion">${proposalValue(p,'conclusion')}</textarea></div></div>`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="openScheduleDetail('${s.id}')">返回详情</button><button class="tms-btn tms-btn-primary" id="coachProposalSaveBtn" onclick="saveCoachProposal('${s.id}')">保存提案</button>`;
  openStandardModal({title:p.id?'修改教练提案':'填写教练提案',bodyHtml:body,actionsHtml:footer,extraClass:'modal-wide'});
}
async function saveCoachProposal(scheduleId){
  const s=schedules.find(x=>x.id===scheduleId);if(!s)return;
  const p=scheduleCoachProposal(s);
  const value=id=>document.getElementById(id)?.value.trim()||'';
  const required=['cp_courseName','cp_studentLevel','cp_studentCount','cp_teachingGoal','cp_progression1','cp_progression2','cp_progression3','cp_progressionLogic','cp_conclusion'];
  if(required.some(id=>!value(id))){toast('请填写完整教练提案','warn');return;}
  const data={scheduleId:s.id,classId:s.classId||'',coach:s.coach||'',courseType:scheduleCourseType(s),courseName:value('cp_courseName'),studentLevel:value('cp_studentLevel'),studentCount:value('cp_studentCount'),teachingGoal:value('cp_teachingGoal'),teachingOrganization:'',progression1:value('cp_progression1'),progression2:value('cp_progression2'),progression3:value('cp_progression3'),progressionLogic:value('cp_progressionLogic'),conclusion:value('cp_conclusion')};
  const btn=document.getElementById('coachProposalSaveBtn');if(btn){btn.disabled=true;btn.textContent='保存中…';}
  try{
    const saved=p?.id?await apiCall('PUT','/coach-proposals/'+p.id,data):await apiCall('POST','/coach-proposals',data);
    const i=coachProposals.findIndex(row=>row.id===saved.id);if(i>=0)coachProposals[i]=saved;else coachProposals.unshift(saved);
    toast('教练提案已保存','success');
    renderSchedule();renderCoachOps();renderWorkbench();renderMySchedule();
    openScheduleDetail(s.id);
  }catch(e){toast('保存失败：'+e.message,'error');if(btn){btn.disabled=false;btn.textContent='保存提案';}}
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
let scheduleDetailActiveTab='info';
let scheduleDetailEditingSection='';
function scheduleDetailEmpty(value){
  return detailDrawerEmpty(value);
}
function scheduleDetailField(label,value,options={}){
  return renderDetailDrawerField(label,value,options);
}
function scheduleDetailBlock(label,html){
  return renderDetailDrawerBlock(label,html);
}
function scheduleDetailInput(label,id,value,type='text'){
  return renderDetailDrawerInput(label,id,value,type);
}
function renderScheduleDetailCard(title,content,{section='',scheduleId='',className='',actionLabel='编辑',feedbackId=''}={}){
  const editing=scheduleDetailEditingSection===section;
  if(section==='schedule-form'){
    return renderDetailDrawerCard(title,content,{className,actionsHtml:`<button type="button" class="schedule-detail-action" onclick="openScheduleModal('${scheduleId}')">编辑</button>`});
  }
  const posterAction=section==='feedback'&&feedbackId&&!editing?`<button type="button" class="schedule-detail-action" onclick="openFeedbackPosterModal('${feedbackId}','${scheduleId}')">生成海报</button>`:'';
  const actions=section?`${editing?`<button type="button" class="schedule-detail-action muted" onclick="cancelScheduleDetailSectionEdit('${scheduleId}')">取消</button><button type="button" class="schedule-detail-action primary" onclick="saveScheduleDetailSectionEdit('${scheduleId}','${section}')">保存修改</button>`:`${posterAction}<button type="button" class="schedule-detail-action" onclick="editScheduleDetailSection('${scheduleId}','${section}')">${esc(actionLabel)}</button>`}`:'';
  return renderDetailDrawerCard(title,content,{className,actionsHtml:actions});
}
function renderScheduleDetailFormCard(title,content,actions=''){
  return renderDetailDrawerFormCard(title,content,actions);
}
function scheduleDetailHeaderHtml(s,studentNames){
  const title=scheduleDetailEmpty(studentNames);
  const initial=title.slice(0,1)||'学';
  const rawStatus=effectiveScheduleStatus(s);
  const status=scheduleStatusLabel(rawStatus);
  const timeText=`${fmtDt(s.startTime)}${s.endTime?` - ${String(s.endTime).slice(11,16)}`:''}`;
  return renderDetailDrawerHero({title,avatar:initial,subtitle:[timeText,scheduleLocationText(s)].filter(Boolean).join(' · '),statusHtml:`<span class="tms-tag ${scheduleStatusTagClass(rawStatus)} schedule-detail-status">${esc(status)}</span>`});
}
function scheduleDetailCreateHeaderHtml(seed={}){
  const start=String(seed.startTime||'').trim();
  const timeText=start?`${fmtDt(start)}${seed.endTime?` - ${String(seed.endTime).slice(11,16)}`:''}`:'填写排课信息';
  return renderDetailDrawerHero({title:'新建排课',avatar:'新',subtitle:[timeText,seed.venue||''].filter(Boolean).join(' · '),statusText:'待保存'});
}
function scheduleDetailTabsHtml(active,{create=false}={}){
  const tabs=create?[['info','排课信息']]:[['info','排课信息'],['proposal','教练提案'],['feedback','课后反馈']];
  return renderDetailDrawerTabs(active,tabs,{onClick:'setScheduleDetailTab'});
}
function setScheduleDetailTab(tab){
  scheduleDetailActiveTab=tab;
  scheduleDetailEditingSection='';
  const id=document.getElementById('overlay')?.dataset.scheduleDetailId||'';
  if(id)openScheduleDetail(id);
}
function editScheduleDetailSection(scheduleId,section){
  scheduleDetailEditingSection=section;
  openScheduleDetail(scheduleId);
}
function cancelScheduleDetailSectionEdit(scheduleId){
  scheduleDetailEditingSection='';
  openScheduleDetail(scheduleId);
}
function scheduleDetailValue(id){
  return document.getElementById(id)?.value.trim()||'';
}
async function saveScheduleDetailSectionEdit(scheduleId,section){
  const s=schedules.find(x=>x.id===scheduleId);if(!s)return;
  const saveButton=document.querySelector('.modal.modal-schedule-drawer .schedule-detail-card-actions .schedule-detail-action.primary');
  if(saveButton?.disabled)return;
  if(saveButton){saveButton.disabled=true;saveButton.textContent='保存中…';}
  try{
    if(section==='info'){
      const data={courseType:scheduleDetailValue('sd_courseType')||s.courseType,coach:scheduleDetailValue('sd_coach')||s.coach,scheduleSource:scheduleDetailValue('sd_scheduleSource')||s.scheduleSource};
      const result=await apiCall('PUT','/schedule/'+s.id,data);
      mergeScheduleSaveResult(result,s.id);
      renderAfterScheduleMutation();
    }else if(section==='notes'){
      const result=await apiCall('PUT','/schedule/'+s.id,{notes:scheduleDetailValue('sd_notes')});
      mergeScheduleSaveResult(result,s.id);
      renderAfterScheduleMutation();
    }else if(section==='proposal'){
      await saveScheduleDetailProposal(s);
    }else if(section==='feedback'){
      const savedFeedback=await saveScheduleDetailFeedback(s);
      scheduleDetailEditingSection='';
      toast('已保存','success');
      if(isCoachPortalUser()&&savedFeedback?.id){openFeedbackPosterModal(savedFeedback.id,s.id);return;}
      openScheduleDetail(scheduleId);
      return;
    }
    scheduleDetailEditingSection='';
    toast('已保存','success');
    openScheduleDetail(scheduleId);
  }catch(e){
    if(saveButton){saveButton.disabled=false;saveButton.textContent='保存修改';}
    toast('保存失败：'+scheduleSaveErrorText(e),'error');
  }
}
async function saveScheduleDetailProposal(s){
  const p=scheduleCoachProposal(s);
  const data={scheduleId:s.id,classId:s.classId||'',coach:s.coach||'',courseType:scheduleCourseType(s),courseName:p?.courseName||s.className||s.productName||'小班课',studentLevel:scheduleDetailValue('sd_cp_studentLevel'),studentCount:scheduleDetailValue('sd_cp_studentCount'),teachingGoal:scheduleDetailValue('sd_cp_teachingGoal'),teachingOrganization:'',progression1:scheduleDetailValue('sd_cp_progression1'),progression2:scheduleDetailValue('sd_cp_progression2'),progression3:scheduleDetailValue('sd_cp_progression3'),progressionLogic:scheduleDetailValue('sd_cp_progressionLogic'),conclusion:scheduleDetailValue('sd_cp_conclusion')};
  if(['studentLevel','studentCount','teachingGoal','progression1','progression2','progression3','progressionLogic','conclusion'].some(key=>!data[key]))throw new Error('请填写完整教练提案');
  const saved=p?.id?await apiCall('PUT','/coach-proposals/'+p.id,data):await apiCall('POST','/coach-proposals',data);
  const i=coachProposals.findIndex(row=>row.id===saved.id);if(i>=0)coachProposals[i]=saved;else coachProposals.unshift(saved);
}
async function saveScheduleDetailFeedback(s){
  const fb=scheduleFeedback(s);
  const studentIds=parseArr(s.studentIds);
  const practicedToday=scheduleDetailValue('sd_fb_practiced');
  const nextTraining=scheduleDetailValue('sd_fb_nextTraining');
  if(!practicedToday||!nextTraining)throw new Error('请填写「今天练习了」和「下次练习」');
  const isTrial=scheduleIsTrial(s);
  const data={scheduleId:s.id,studentId:studentIds[0]||'',studentIds,studentName:s.studentName||'',coach:s.coach||'',startTime:s.startTime||'',campus:s.campus||'',venue:s.venue||'',lessonCount:s.lessonCount||0,isTrial,remainingLessons:scheduleRemainingLessons(s),practicedToday,knowledgePoint:scheduleDetailValue('sd_fb_knowledge'),nextTraining,playerLevel:fb?.playerLevel||'',goalType:'',experienceBackground:'',mainIssues:fb?.mainIssues||'',conversionIntent:fb?.conversionIntent||'',recommendedProductType:fb?.recommendedProductType||'',recommendedReason:'',needOpsFollowUp:!!fb?.needOpsFollowUp,opsFollowUpPriority:'',opsFollowUpSuggestion:''};
  const saved=fb?.id?await apiCall('PUT','/feedbacks/'+fb.id,data):await apiCall('POST','/feedbacks',data);
  const i=feedbacks.findIndex(f=>f.id===saved.id);if(i>=0)feedbacks[i]=saved;else feedbacks.unshift(saved);
  return saved;
}
function scheduleDetailInfoHtml(s,ent,studentNames,primaryCoachText,ownerCoachText){
  const settlement=scheduleSettlementTypeLabel(s?.settlementType||'package');
  const packageText=(s?.settlementType||'package')==='package'?scheduleEntitlementSummary(s):(s?.settlementType==='direct'?`${s.payMethod||'收款'} ¥${fmt(parseFloat(s.paidAmount)||0)}`:'赠送/免费');
  const location=scheduleLocationDetailParts(s);
  const lessonField=scheduleLessonDisplayField(s);
  return [
    scheduleDetailField('学员姓名',studentNames),
    scheduleDetailField('课程类型',standardCourseTypeLabel(scheduleCourseType(s),s.experienceType,s.smallClassType)||courseTypeDisplayLabel(ent)||''),
    scheduleDetailField('结算方式',settlement),
    scheduleDetailField('扣减课包',packageText),
    scheduleDetailField('上课时间',`${fmtDt(s.startTime)}${s.endTime?` - ${String(s.endTime).slice(11,16)}`:''}`),
    scheduleDetailField(lessonField.label,lessonField.value),
    scheduleDetailField('上课教练',coachName(s.coach)||''),
    scheduleDetailField('地点类型',location.type),
    scheduleDetailField('上课校区/场馆名称',location.place),
    scheduleDetailField('场地',location.court),
    scheduleDetailField('循环排课',scheduleRepeatDisplayText(s))
  ].join('');
}
function scheduleLessonDisplayField(s={}){
  const settlementType=s?.settlementType||'package';
  if(settlementType==='direct'||settlementType==='gift'||scheduleCourseType(s)==='陪打')return {label:'服务时长',value:`${lessonUnitsText(s.lessonCount||0)} 小时`};
  return {label:'消课时数',value:`${lessonUnitsText(s.lessonCount||0)} ${scheduleCourseType(s)==='小班课'?'次':'节'}`};
}
function scheduleDetailNotesHtml(s,studentNotes,recentFeedback,fb){
  const editing=scheduleDetailEditingSection==='notes';
  if(editing){
    return [
      scheduleDetailField('学员备注',studentNotes),
      scheduleDetailInput('排课备注','sd_notes',s.notes||'','textarea')
    ].join('');
  }
  return [
    scheduleDetailField('学员备注',studentNotes,{full:true}),
    scheduleDetailField('排课备注',s.notes||'',{full:true})
  ].join('');
}
function scheduleProposalEmptyIcon(kind){
  if(kind==='not-required')return `<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M491.312 99.816a26.84 26.84 0 0 0-17.448-12.888c-8.368-1.672-15.824-0.4-22.112 3.792l-0.568 0.376c-14.856 9.76-49.808 37.096-53.304 79.856-3.2 34.528 13.32 67.776 49.16 98.84 20.112 16.8 31.08 34.584 29.336 47.656s-18.344 24.104-24 26.944l-0.088 0.04a26.344 26.344 0 0 0-14.4 16.696 29.336 29.336 0 0 0 1.504 21.368 25.928 25.928 0 0 0 25.808 15.2h0.136a36.536 36.536 0 0 0 6.584-0.8 40.608 40.608 0 0 1 6.944-0.848c2.528-1 14.44-6.936 26.856-18.656 11.08-10.464 24.952-28.048 27.88-52.288 4.752-32.472-12.072-65.688-50.008-98.784-20.8-18.4-30.68-35.2-29.328-50 1.712-20.504 19.616-32.568 27.2-36.8 6.712-3.728 11.32-9.6 13.712-17.496 1.656-8.368 0.376-15.792-3.8-22.056zM656.52 99.816a26.552 26.552 0 0 0-18.216-12.88c-8.416-1.68-15.872-0.408-22.152 3.784l-0.568 0.376c-14.864 9.76-49.808 37.096-53.312 79.856-2.4 34.728 14.4 68 49.984 98.84 20.112 16.8 31.08 34.584 29.336 47.656s-18.352 24.104-24 26.944l-0.088 0.04a27.024 27.024 0 0 0-14.4 15.936 29.296 29.296 0 0 0 1.52 21.312c4.688 10.152 14.568 15.944 25.808 15.2h0.144a36.36 36.36 0 0 0 6.576-0.8 41.504 41.504 0 0 1 6.952-0.856c2.52-0.992 14.4-6.92 26.856-18.648 11.104-10.488 24.96-28.072 27.888-52.312C703.552 291.848 687.2 259.824 648.8 226.32c-14.56-13.656-31-31.624-29.32-50 1.696-20.488 19.608-32.568 27.2-36.8 6.712-3.728 11.328-9.6 13.72-17.496 1.648-8.376 0.368-15.8-3.808-22.056zM301.6 90.816c-3.728-6.712-9.6-11.32-17.504-13.712-8.368-1.648-15.792-0.376-22.056 3.8l-0.568 0.376c-14.864 9.76-49.808 37.088-53.312 79.856-3.2 35.144 13.152 67.736 49.984 99.664 19.856 16.552 31.096 34.512 29.336 46.856-1.736 13.024-18.344 24.08-24 26.92h-0.088a26.4 26.4 0 0 0-14.4 16.688 29.312 29.312 0 0 0 1.504 21.376c4.624 10.024 14.4 16 24.976 15.2h0.152a35.664 35.664 0 0 0 6.576-0.8 41.52 41.52 0 0 1 6.952-0.848c2.528-1 14.448-6.944 26.856-18.656 11.112-10.488 24.96-28.072 27.888-52.312 4.752-32.44-11.608-64.464-50.016-97.96-20.8-18.4-30.672-35.2-29.32-50.008 1.704-20.512 19.608-32.568 27.2-36.8 6.704-3.728 11.32-9.6 13.712-17.496 1.648-8.376 0.376-15.8-3.8-22.064zM972 636.96c0.384-37.688-5.528-59.944-19.776-74.44-18.64-18.952-53.304-26.88-119.656-27.344h-2.064v-44.608a64.664 64.664 0 0 0-17.432-43.568c-10.8-11.528-26.672-18.144-43.472-18.144H125.088c-15.856 0-31.816 6.496-42.696 17.376-11.736 11.744-18.2 26.904-18.2 42.696v159.488c0.872 33.12 4.432 64.36 10.584 92.8C83.432 779.2 106.776 852 165.832 912.8c67.144 68 161.856 102.4 281.496 102.4 120.184 0 215.2-34.464 282.328-102.4 14.608-15.472 26.584-30.104 36.568-44.688l0.616-0.904h57.528c81.384 0 147.6-65.48 147.6-145.96z m-200.344 17.248c-0.8 24-3.736 48.968-9.04 76.392-13.008 56.8-37.96 103.896-74.176 140.112-27.616 28-62 49.52-102.192 63.872-40.496 14.464-87.2 21.792-138.92 21.792-51.024 0-97.072-7.2-136.88-21.48s-74.24-35.824-102.592-64.184c-35.648-35.008-60.44-81.872-75.792-143.272a285.744 285.744 0 0 1-9.056-79.088v-163.2h2.104c134.2 1.6 639.376 1.6 644.464 1.6h2.08z m142.304 66.216a89.544 89.544 0 0 1-26.584 62.272 91.032 91.032 0 0 1-62.968 26.464H798.4l1.168-2.864a428.144 428.144 0 0 0 19.536-60.216c7.792-31.2 11.344-61.536 10.568-90.248v-62.656h6.656c28.408 0 52.944-0.072 66.336 13.304 7.064 7.064 10.504 17.304 10.504 31.304v80.528h0.856z" fill="currentColor"/></svg>`;
  return `<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M909.016 820.828H841a30 30 0 0 1 0-60h38.016a20 20 0 0 0 20-20V145.185a20 20 0 0 0-20-20H352a20 20 0 0 0-20 20v28h370.016a50 50 0 0 1 50 50v223.36a29.989 29.989 0 1 1-59.507 5.283h-0.493V253.185a20 20 0 0 0-20-20H145a20 20 0 0 0-20 20v625.643a20 20 0 0 0 20 20h337a30 30 0 0 1 0 60H115a50 50 0 0 1-50-50V223.185a50 50 0 0 1 50-50h157v-58a50 50 0 0 1 50-50h587.016a50 50 0 0 1 50 50v655.643a50 50 0 0 1-50 50z m-663.037-484H572.74a29.979 29.979 0 1 1 0 59.957H245.979a29.979 29.979 0 1 1 0-59.957z m0 290.043h74.912a29.979 29.979 0 0 1 29.979 29.978 29.979 29.979 0 0 1-29.979 29.979h-74.912A29.979 29.979 0 0 1 216 656.849a29.979 29.979 0 0 1 29.979-29.978zM216 511.807a29.979 29.979 0 0 1 29.979-29.979h140.935a29.979 29.979 0 0 1 29.979 29.979v0.042a29.979 29.979 0 0 1-29.979 29.979H245.979A29.979 29.979 0 0 1 216 511.849v-0.042z m163 177.521c0-107.419 87.081-194.5 194.5-194.5S768 581.909 768 689.328a193.618 193.618 0 0 1-37.9 115.356l84.115 84.115a30 30 0 1 1-42.425 42.429l-84.3-84.3a193.6 193.6 0 0 1-113.99 36.9c-107.419 0-194.5-87.081-194.5-194.5z m194.5 134.5a134.5 134.5 0 1 0-134.5-134.5 134.5 134.5 0 0 0 134.5 134.5z" fill="currentColor"/></svg>`;
}
function scheduleDetailProposalEmptyHtml(kind){
  const title='暂无教练提案';
  const text=kind==='not-required'?'当前学员无需填写教练提案。':kind==='missing'?'教练尚未提交教练提案，可联系教练提交。':'请填写本节课教练提案。';
  return `<div class="schedule-proposal-empty"><div class="schedule-proposal-empty-icon">${scheduleProposalEmptyIcon(kind)}</div><div class="schedule-proposal-empty-title">${title}</div><div class="schedule-proposal-empty-text">${esc(text)}</div></div>`;
}
function scheduleDetailProposalCardsHtml(s,proposal,{section='',scheduleId=''}={}){
  const p=proposal||{};
  const editing=scheduleDetailEditingSection==='proposal';
  const studentCount=p.studentCount||parseArr(s.studentIds).length||'';
  const studentInfoTitle='学员信息';
  const studentInfo=editing?[
      scheduleDetailInput('学员级别','sd_cp_studentLevel',p.studentLevel||''),
      scheduleDetailInput('学员数量','sd_cp_studentCount',studentCount),
      scheduleDetailInput('教学目标','sd_cp_teachingGoal',p.teachingGoal||'','textarea')
    ].join(''):[
      scheduleDetailField('学员级别',p.studentLevel),
      scheduleDetailField('学员数量',studentCount),
      scheduleDetailField('教学目标',p.teachingGoal,{full:true})
    ].join('');
  const organizationTitle='教学组织';
  const organization=editing?[
      scheduleDetailInput('1级进阶','sd_cp_progression1',p.progression1||'','textarea'),
      scheduleDetailInput('2级进阶','sd_cp_progression2',p.progression2||'','textarea'),
      scheduleDetailInput('3级进阶','sd_cp_progression3',p.progression3||'','textarea')
    ].join(''):[
      scheduleDetailField('1级进阶',p.progression1,{full:true}),
      scheduleDetailField('2级进阶',p.progression2,{full:true}),
      scheduleDetailField('3级进阶',p.progression3,{full:true})
    ].join('');
  const logicTitle='进阶逻辑';
  const logic=editing?[
      scheduleDetailInput('进阶逻辑','sd_cp_progressionLogic',p.progressionLogic||'','textarea'),
      scheduleDetailInput('结语','sd_cp_conclusion',p.conclusion||'','textarea')
    ].join(''):[
      scheduleDetailField('进阶逻辑',p.progressionLogic,{full:true}),
      scheduleDetailField('结语',p.conclusion,{full:true}),
      scheduleDetailField('提交时间',p.submittedAt?fmtDt(p.submittedAt):'',{full:true})
    ].join('');
  return [
    renderScheduleDetailCard(studentInfoTitle,studentInfo,{section,scheduleId,className:'schedule-proposal-card'}),
    renderScheduleDetailCard(organizationTitle,organization,{className:'schedule-proposal-card'}),
    renderScheduleDetailCard(logicTitle,logic,{className:'schedule-proposal-card'})
  ].join('');
}
function scheduleDetailProposalHtml(s,proposal,{section='',scheduleId=''}={}){
  if(!isSmallGroupSchedule(s))return renderScheduleDetailCard('教练提案',scheduleDetailProposalEmptyHtml('not-required'),{className:'schedule-proposal-card'});
  if(!proposal&&isCoachPortalUser()&&scheduleDetailEditingSection==='proposal')return scheduleDetailProposalCardsHtml(s,{},{section,scheduleId});
  if(!proposal&&!isCoachPortalUser())return renderScheduleDetailCard('教练提案',scheduleDetailProposalEmptyHtml('missing'),{className:'schedule-proposal-card'});
  if(!proposal)return renderScheduleDetailCard('教练提案',scheduleDetailProposalEmptyHtml('coach-missing'),{section,scheduleId,className:'schedule-proposal-card',actionLabel:'填写'});
  return scheduleDetailProposalCardsHtml(s,proposal,{section,scheduleId});
}
function scheduleDetailFeedbackFormHtml(s,fb){
  return [
    scheduleDetailInput('今天练习了','sd_fb_practiced',fb?.practicedToday||fb?.template?.focus||fb?.performance||'','textarea'),
    scheduleDetailInput('练习情况','sd_fb_knowledge',fb?.knowledgePoint||fb?.problems||'','textarea'),
    scheduleDetailInput('下次练习','sd_fb_nextTraining',fb?.nextTraining||fb?.nextAdvice||'','textarea')
  ].join('');
}
function scheduleDetailFeedbackHtml(s,fb){
  if(!fb&&isCoachPortalUser()&&scheduleDetailEditingSection==='feedback')return scheduleDetailFeedbackFormHtml(s,{});
  if(!fb)return scheduleDetailFeedbackEmptyHtml();
  if(scheduleDetailEditingSection==='feedback'){
    return [
      scheduleDetailFeedbackFormHtml(s,fb)
    ].join('');
  }
  return [
    scheduleDetailField('今天练习了',fb?.practicedToday||fb?.template?.focus||fb?.performance||'',{full:true}),
    scheduleDetailField('练习情况',fb?.knowledgePoint||fb?.problems||'',{full:true}),
    scheduleDetailField('下次练习',fb?.nextTraining||fb?.nextAdvice||'',{full:true})
  ].join('');
}
function scheduleDetailFeedbackEmptyHtml(){
  return `<div class="schedule-proposal-empty"><div class="schedule-proposal-empty-icon">${scheduleProposalEmptyIcon('missing')}</div><div class="schedule-proposal-empty-title">暂无课后反馈</div><div class="schedule-proposal-empty-text">教练尚未填写课后反馈。</div></div>`;
}
function scheduleDetailLateHtml(s){
  return [
    scheduleDetailField('是否迟到',s.coachLateFree?'是，本节课不扣学员课时':'否'),
    scheduleDetailField('迟到原因',s.lateReason),
    scheduleDetailField('迟到时长',`${parseInt(s.lateMinutes)||0} 分钟`),
    scheduleDetailField('需承担场地费用',`¥${fmt(parseFloat(s.coachLateFieldFeeAmount)||0)}`)
  ].join('');
}
function openScheduleDetail(scheduleId){
  const s=schedules.find(x=>x.id===scheduleId);if(!s)return;
  const isCoachDetail=isCoachPortalUser();
  const fb=scheduleFeedback(s);
  const proposal=scheduleCoachProposal(s);
  const ent=findEntitlementForSchedule(s);
  const studentNames=scheduleStudentSummary(s);
  const stuRecords=parseArr(s.studentIds).map(id=>students.find(st=>st.id===id)).filter(Boolean);
  const primaryCoachText=[...new Set(stuRecords.map(st=>studentPrimaryCoachText(st)).filter(Boolean))].join('、')||'未分配';
  const ownerCoachText=[...new Set(stuRecords.map(st=>myStudentOwnerCoachText(st)).filter(Boolean))].join('、')||'未设置';
  const studentNotes=stuRecords.map(st=>st.notes).filter(Boolean).join('；');
  const recentFeedback=stuRecords.flatMap(st=>feedbacks.filter(item=>item.studentId===st.id||parseArr(item.studentIds).includes(st.id))).filter(item=>item.id!==fb?.id).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,2);
  const infoHtml=`${renderScheduleDetailCard('基础信息',scheduleDetailInfoHtml(s,ent,studentNames,primaryCoachText,ownerCoachText),{section:isCoachDetail?'':'schedule-form',scheduleId:s.id})}${renderScheduleDetailCard('设置迟到',scheduleDetailLateHtml(s))}${renderScheduleDetailCard('备注信息',scheduleDetailNotesHtml(s,studentNotes,recentFeedback,fb),{section:isCoachDetail?'':'notes',scheduleId:s.id})}`;
  const proposalCanEdit=isSmallGroupSchedule(s)&&(!!proposal||isCoachDetail);
  const proposalHtml=scheduleDetailProposalHtml(s,proposal,{section:proposalCanEdit?'proposal':'',scheduleId:s.id});
  const feedbackCanEdit=!!fb||isCoachDetail;
  const feedbackHtml=renderScheduleDetailCard('反馈内容',scheduleDetailFeedbackHtml(s,fb),{section:feedbackCanEdit?'feedback':'',scheduleId:s.id,className:'schedule-feedback-card',actionLabel:fb?'编辑':'填写反馈',feedbackId:fb?.id||''});
  const body=`<div class="schedule-detail-content">${scheduleDetailActiveTab==='info'?infoHtml:scheduleDetailActiveTab==='proposal'?proposalHtml:feedbackHtml}</div>`;
  openStandardDetailDrawer({
    titleHtml:`${scheduleDetailHeaderHtml(s,studentNames)}${scheduleDetailTabsHtml(scheduleDetailActiveTab)}`,
    bodyHtml:body,
    actionsHtml:'',
    data:{scheduleDetailId:s.id},
    overlayClasses:['schedule-drawer-overlay'],
    modalClass:'modal modal-court modal-schedule-drawer'
  });
}
