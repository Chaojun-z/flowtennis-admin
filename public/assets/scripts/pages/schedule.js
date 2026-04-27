// ===== 排课表 =====
function syncScheduleFilterOptions(){
  const statusValue=document.getElementById('schStatusFilter')?.value||'';
  const campusValue=document.getElementById('schCampusFilter')?.value||'';
  const courseTypeValue=document.getElementById('schCourseTypeFilter')?.value||'';
  const statusOptions=[{value:'',label:'全部状态'},{value:'已排课',label:'待上课'},{value:'已结束',label:'已下课'},{value:'已取消',label:'已取消'}];
  const hasExternal=schedules.some(s=>isExternalSchedule(s));
  const campusOptions=[{value:'',label:'全部校区'},...campuses.map(c=>({value:c.code||c.id,label:c.name||c.code||c.id})),...(hasExternal?[{value:'__external__',label:'外部场馆'}]:[])];
  const courseTypeOptions=[{value:'',label:'全部课程类型'},...PRODUCT_TYPES.map(t=>({value:t,label:t}))];
  [['schStatusFilterHost','schStatusFilter','全部状态',statusOptions,statusValue],['schCampusFilterHost','schCampusFilter','全部校区',campusOptions,campusValue],['schCourseTypeFilterHost','schCourseTypeFilter','全部课程类型',courseTypeOptions,courseTypeValue]].forEach(([hostId,id,label,options,value])=>{
    const host=document.getElementById(hostId);
    if(host)host.innerHTML=renderCourtDropdownHtml(id,label,options,value,false,'renderSchedule');
  });
}
function isExternalSchedule(s){
  return s?.locationType==='external'||s?.campus==='__external__';
}
function scheduleLocationText(s){
  if(isExternalSchedule(s)){
    const name=s.externalVenueName||String(s.venue||'').split(' · ')[0]||'外部场馆';
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
function renderSchedule(){
  syncScheduleFilterOptions();
  const q=(document.getElementById('schSearch')?.value||'').toLowerCase();
  const sf=document.getElementById('schStatusFilter')?.value||'';
  const cf=document.getElementById('schCampusFilter')?.value||'';
  const tf=document.getElementById('schCourseTypeFilter')?.value||'';
  const now=new Date();
  let list=schedules.filter(s=>{
    const cls=s.classId?classes.find(c=>c.id===s.classId):null;
    const effectiveStatus=effectiveScheduleStatus(s,now);
    const stuText=parseArr(s.studentIds).map(sid=>{const st=students.find(x=>x.id===sid);return `${st?.name||sid} ${st?.phone||''}`;}).join(' ');
    if(!searchHit(q,s.studentName,stuText,s.coach,s.venue,s.externalVenueName,s.externalNotes,effectiveStatus,scheduleStatusLabel(effectiveStatus),scheduleLocationText(s),cn(s.campus),s.notes,cls?.className,cls?.productName,fmtDt(s.startTime),fmtDt(s.endTime),s.cancelReason,s.scheduleSource))return false;
    if(sf&&effectiveStatus!==sf)return false;
    if(cf&&s.campus!==cf)return false;
    if(tf&&scheduleCourseType(s)!==tf)return false;
    return true;
  }).map(s=>({...s,_effectiveStatus:effectiveScheduleStatus(s,now)})).sort((a,b)=>new Date(b.startTime||0)-new Date(a.startTime||0));
  const total=list.length,pages=Math.ceil(total/PAGE_SIZE);
  if(schPage>Math.max(pages,1))schPage=1;
  const slice=list.slice((schPage-1)*PAGE_SIZE,schPage*PAGE_SIZE);
  const pager=document.querySelector('#page-schedule .tms-pagination');
  if(pager)pager.style.display=pages>1?'flex':'none';
  document.getElementById('schPagerInfo').textContent=`共 ${total} 条`;
  document.getElementById('schPagerBtns').innerHTML=pages<=1?'':Array.from({length:pages},(_,i)=>`<div class="tms-page-btn${i+1===schPage?' active':''}" onclick="schPage=${i+1};renderSchedule()">${i+1}</div>`).join('');
  document.getElementById('schTbody').innerHTML=slice.length?slice.map(s=>{
    const fb=scheduleFeedback(s);
    const status=s._effectiveStatus||effectiveScheduleStatus(s);
    const dateText=String(s.startTime||'').slice(0,10)||'—';
    const timeText=s.startTime?`${s.startTime.slice(11,16)}-${(s.endTime||'').slice(11,16)}`:'—';
    return `<tr><td style="padding-left:14px">${renderCourtCellText(dateText,false)}</td><td>${renderCourtCellText(timeText,false)}</td><td>${renderCourtCellText(scheduleDurationText(s),false)}</td><td><div class="tms-cell-text" title="${esc(s.externalNotes||scheduleLocationText(s))}">${esc(scheduleLocationText(s))}</div></td><td>${renderCourtCellText(s.coach,false)}</td><td><div class="tms-text-primary">${esc(scheduleListStudentSummary(s))}</div></td><td><span class="tms-tag ${productTypeTagClass(scheduleCourseType(s))}">${esc(scheduleCourseType(s))}</span></td><td><span class="tms-action-link" onclick="openFeedbackModal('${s.id}')">${scheduleFeedbackStatusText(s)}</span></td><td><span class="tms-tag ${scheduleStatusTagClass(status)}">${scheduleStatusLabel(status)}</span>${status==='已取消'&&s.cancelReason?`<div class="tms-text-secondary" style="margin-top:6px">${esc(s.cancelReason)}</div>`:''}</td><td class="tms-sticky-r tms-action-cell schedule-action-cell"><span class="tms-action-link" onclick="openScheduleDetail('${s.id}')">查看</span><span class="tms-action-link" onclick="openScheduleModal('${s.id}')">编辑</span><span class="tms-action-link" onclick="openCancelScheduleModal('${s.id}')">取消</span>${scheduleCanDeleteMistake(s)?`<span class="tms-action-link" onclick="confirmDel('${s.id}','误建排课','schedule')">删除</span>`:''}</td></tr>`;
  }).join(''):'<tr><td colspan="10"><div class="empty"><div class="empty-ico">📅</div><p>暂无排课</p></div></td></tr>';
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
function syncScheduleHomeCampusFromStudents(ids,applyDefault=true){
  const meta=scheduleSelectedStudentHomeCampusMeta(ids);
  const summary=document.getElementById('sch_homeCampusSummary');
  if(summary)summary.textContent=meta.text;
  if(applyDefault&&meta.campus&&(document.getElementById('sch_locationType')?.value||'own')==='own'){
    setCourtDropdownValue('sch_campus',meta.campus,cn(meta.campus)||meta.campus);
  }
}
function syncScheduleProfileFromStudents(ids,applyDefault=true){
  syncScheduleHomeCampusFromStudents(ids,applyDefault);
  const meta=scheduleSelectedStudentCoachMeta(ids);
  if(applyDefault&&meta.coach)setCourtDropdownValue('sch_coach',meta.coach,meta.coach);
}
function renderScheduleStudentPicker(selectedIds=[],keyword=''){
  const picked=new Set(parseArr(selectedIds));
  const q=String(keyword||'').trim().toLowerCase();
  const rows=students.filter(s=>{
    if(!q)return true;
    return [s.name,s.phone,cn(s.campus)].some(v=>String(v||'').toLowerCase().includes(q));
  }).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'zh-CN'));
  if(!rows.length)return '<div style="font-size:12px;color:var(--td);padding:10px 0">没有匹配到学员，请换个关键词。</div>';
  return `<div id="sch_stuPicker" class="tms-checkbox-matrix">${rows.map(s=>`<label class="tms-checkbox-wrap"><input type="checkbox" class="tms-checkbox sch-stu-cb" value="${s.id}" ${picked.has(s.id)?'checked':''} onchange="toggleScheduleStudentCheckbox()"><span>${esc(s.name)}${s.phone?` · ${esc(s.phone)}`:''} · ${esc(cn(s.campus)||'未设校区')}</span></label>`).join('')}</div>`;
}
function updateScheduleStudentSummary(ids){
  const summary=document.getElementById('sch_stuSummary');
  if(summary){
    const expected=parseArr(document.getElementById('sch_expectedStuIds')?.value||'[]');
    const absent=(expected.length?expected:parseArr(ids)).filter(id=>!parseArr(ids).includes(id));
    summary.textContent=`本次上课：${scheduleStudentTextByIds(ids)||'未选择学员'}${absent.length?`；缺勤：${scheduleStudentTextByIds(absent)}`:''}`;
  }
}
function setScheduleStudentSelection(ids,keepKeyword=false,applyCampusDefault=true){
  const normalized=[...new Set(parseArr(ids).filter(Boolean))];
  const hidden=document.getElementById('sch_stuIds');
  if(hidden)hidden.value=JSON.stringify(normalized);
  updateScheduleStudentSummary(normalized);
  const host=document.getElementById('sch_stuPickerWrap');
  if(host){
    const keyword=keepKeyword?(document.getElementById('sch_stuSearch')?.value||''):'';
    host.innerHTML=renderScheduleStudentPicker(normalized,keyword);
  }
  syncScheduleProfileFromStudents(normalized,applyCampusDefault);
}
function applyScheduleStudentFilter(){
  const ids=parseArr(document.getElementById('sch_stuIds')?.value||'[]');
  setScheduleStudentSelection(ids,true,false);
}
function syncSelectedStudentsFromPicker(){
  const ids=[...document.querySelectorAll('.sch-stu-cb:checked')].map(o=>o.value).filter(Boolean);
  const hidden=document.getElementById('sch_stuIds');
  if(hidden)hidden.value=JSON.stringify(ids);
  updateScheduleStudentSummary(ids);
  syncScheduleProfileFromStudents(ids,true);
}
function toggleScheduleStudentCheckbox(){
  syncSelectedStudentsFromPicker();
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
  if(type==='own')syncScheduleHomeCampusFromStudents(parseArr(document.getElementById('sch_stuIds')?.value||'[]'),!editId);
  refreshSchEntitlementOptions();
}
// schedule modal field ids: id="sch_date" id="sch_startTime" id="sch_endTime" id="sch_cancelReason" id="sch_scheduleSource"
function openScheduleModal(id,seed={}){
  editId=id;const s=id?schedules.find(x=>x.id===id):(seed||null);
  const classOptions=[{value:'',label:'— 不关联 —'},...classes.filter(c=>c.status==='已排班').map(c=>{const rem=(parseInt(c.totalLessons)||0)-(parseInt(c.usedLessons)||0);return {value:c.id,label:`${c.className} 剩余${rem}节`};})];
  const courseTypeOptions=PRODUCT_TYPES.map(t=>({value:t,label:t}));
  const coachOptions=[{value:'',label:'— 选择 —'},...activeCoachNames().map(c=>({value:c,label:c}))];
  const campusOptions=[{value:'',label:'— 选择 —'},...campuses.map(c=>({value:c.code||c.id,label:c.name||c.code||c.id}))];
  const venueOptions=['1号场','2号场','3号场','4号场'].map(v=>({value:v,label:v}));
  const cancelOptions=[{value:'',label:'— 未取消 —'},...SCH_CANCEL_REASONS.map(t=>({value:t,label:t}))];
  const selectedStudentIds=parseArr(rv(s,'studentIds','[]'));
  const expectedStudentIds=parseArr(rv(s,'expectedStudentIds','[]')).length?parseArr(rv(s,'expectedStudentIds','[]')):selectedStudentIds;
  const startRaw=String(rv(s,'startTime',seed.startTime||'')).trim().replace(' ','T');
  const endRaw=String(rv(s,'endTime',seed.endTime||'')).trim().replace(' ','T');
  const dateValue=startRaw?startRaw.slice(0,10):(endRaw?endRaw.slice(0,10):today());
  const startTimeValue=startRaw&&startRaw.length>=16?startRaw.slice(11,16):(seed.startTime?String(seed.startTime).slice(11,16):'09:00');
  const endTimeValue=endRaw&&endRaw.length>=16?endRaw.slice(11,16):(seed.endTime?String(seed.endTime).slice(11,16):'10:00');
  const scheduleSource=rv(s,'scheduleSource',seed.scheduleSource||'排课表');
  const lateChecked=!!s?.coachLateFree;
  const locationType=isExternalSchedule(s)?'external':'own';
  const externalParts=scheduleExternalVenueParts(s);
  const body=[`<input type="hidden" id="sch_stuIds" value="${rv(s,'studentIds','[]')}"><input type="hidden" id="sch_expectedStuIds" value="${esc(JSON.stringify(expectedStudentIds))}"><input type="hidden" id="sch_scheduleSource" value="${scheduleSource}"><input type="hidden" id="sch_status" value="${rv(s,'status','已排课')}"><div class="tms-audit-note" style="margin-bottom:18px;color:#8C5C3A;background:rgba(217,119,6,0.12)">排课会校验时间冲突；关联班次后默认勾选全员，取消勾选的人本次记为缺勤，不扣课时。</div>`,`<div class="tms-section-header" style="margin-top:0;">人和课程</div><div class="tms-form-row"><div class="tms-form-item" style="flex:0 0 34%"><label class="tms-form-label">关联班次</label>${renderCourtDropdownHtml('sch_classId','关联班次',classOptions,rv(s,'classId'),true,'onSchClassChange')}<div id="sch_class_hint" style="font-size:12px;color:var(--ts);margin-top:8px"></div></div><div class="tms-form-item" style="flex:1"><label class="tms-form-label">本次参与人 *</label><input class="finput tms-form-control" id="sch_stuSearch" placeholder="搜索姓名 / 手机号 / 校区" oninput="applyScheduleStudentFilter()"><div id="sch_stuPickerWrap" style="margin-top:8px">${renderScheduleStudentPicker(selectedStudentIds)}</div><div id="sch_stuSummary" style="font-size:12px;color:var(--ts);margin-top:8px">${esc(scheduleStudentTextByIds(selectedStudentIds)||'未选择学员')}</div><div id="sch_homeCampusSummary" style="font-size:12px;color:var(--ts);margin-top:4px">${esc(scheduleSelectedStudentHomeCampusMeta(selectedStudentIds).text)}</div></div></div>`,`<div class="tms-section-header">上课信息</div><div class="tms-form-row schedule-time-course-row"><div class="tms-form-item schedule-time-field"><label class="tms-form-label">上课日期与时间 *</label>${scheduleTimeRangeControls(dateValue,startTimeValue,endTimeValue)}</div><div class="tms-form-item schedule-course-field"><label class="tms-form-label">课程类型</label>${renderCourtDropdownHtml('sch_courseType','课程类型',courseTypeOptions,normalizeCourseType(rv(s,'courseType')||seed.courseType)||PRODUCT_TYPES[0],true,'refreshSchEntitlementOptions')}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">每周重复</label><div class="finput tms-form-control" style="display:flex;align-items:center;gap:10px"><input type="checkbox" class="tms-checkbox" id="sch_repeatEnabled" ${id?'disabled':''}><span>${id?'编辑时不支持批量重排':'按周生成多节课'}</span></div></div><div class="tms-form-item"><label class="tms-form-label">连续周数</label><input class="finput tms-form-control" id="sch_repeatWeeks" type="number" min="1" max="12" value="1" ${id?'disabled':''}></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">教练 *</label>${renderCourtDropdownHtml('sch_coach','教练',coachOptions,rv(s,'coach')||seed.coach,true,'refreshSchEntitlementOptions')}</div><div class="tms-form-item"><label class="tms-form-label">消课节数</label><input class="finput tms-form-control" id="sch_lc" type="number" value="${rv(s,'lessonCount',seed.lessonCount||1)}" onchange="refreshSchEntitlementOptions()"></div><div class="tms-form-item"><label class="tms-form-label">扣减课包</label><select class="finput tms-form-control" id="sch_entitlement"><option value="${rv(s,'entitlementId','')}">${rv(s,'packageName','- 自动推荐可用课包 -')||'- 自动推荐可用课包 -'}</option></select><div id="sch_ent_hint" style="font-size:12px;color:var(--ts);margin-top:8px"></div></div></div>`,`<div class="tms-section-header">地点</div><div class="tms-form-row schedule-location-row"><div class="tms-form-item schedule-location-type"><label class="tms-form-label">地点类型</label>${renderCourtDropdownHtml('sch_locationType','地点类型',[{value:'own',label:'校区内'},{value:'external',label:'校区外'}],locationType,true,'toggleScheduleLocationType')}</div><div class="schedule-location-fields" id="sch_ownLocationRow"><div class="tms-form-item"><label class="tms-form-label">上课校区 *</label>${renderCourtDropdownHtml('sch_campus','上课校区',campusOptions,locationType==='own'?(rv(s,'campus')||seed.campus):'',true,'refreshSchEntitlementOptions')}</div><div class="tms-form-item"><label class="tms-form-label">场地 *</label>${renderCourtDropdownHtml('sch_venue','场地',venueOptions,locationType==='own'?rv(s,'venue','1号场'):'1号场',true)}</div></div><div class="schedule-location-fields" id="sch_externalLocationRow" style="display:none"><div class="tms-form-item"><label class="tms-form-label">外部场馆 *</label><input class="finput tms-form-control" id="sch_externalVenueName" value="${esc(externalParts.name)}" placeholder="例：奥森网球中心"></div><div class="tms-form-item"><label class="tms-form-label">场地号 *</label><input class="finput tms-form-control" id="sch_externalCourtName" value="${esc(externalParts.court)}" placeholder="例：A1 / 学员自订"></div><div class="tms-form-item"><label class="tms-form-label">说明</label><input class="finput tms-form-control" id="sch_externalNotes" value="${esc(rv(s,'externalNotes'))}" placeholder="可不填"></div></div></div>`,`<details class="schedule-advanced"><summary>更多设置</summary><div class="tms-section-header">教练迟到处理</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">教练迟到免费</label><div class="finput tms-form-control" style="display:flex;align-items:center;gap:10px"><input type="checkbox" class="tms-checkbox" id="sch_coachLateFree" ${lateChecked?'checked':''} onchange="refreshScheduleLateFee()"><span>本节不扣学员课时</span></div></div><div class="tms-form-item"><label class="tms-form-label">迟到分钟</label><input class="finput tms-form-control" id="sch_lateMinutes" type="number" min="0" value="${parseInt(rv(s,'lateMinutes',0))||0}"></div><div class="tms-form-item"><label class="tms-form-label">教练承担场地费</label><input class="finput tms-form-control" id="sch_lateFieldFee" type="number" min="0" value="${parseFloat(rv(s,'coachLateFieldFeeAmount',0))||0}"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">取消原因</label>${renderCourtDropdownHtml('sch_cancelReason','取消原因',cancelOptions,rv(s,'cancelReason'),true)}</div><div class="tms-form-item"><label class="tms-form-label">迟到原因</label><input class="finput tms-form-control" id="sch_lateReason" value="${esc(rv(s,'lateReason'))}" placeholder="例如：教练迟到，本节课免费"></div></div></details><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" id="sch_notes">${esc(rv(s,'notes'))}</textarea></div></div>`].join('');
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button>${id&&scheduleCanDeleteMistake(s)?`<button class="tms-btn tms-btn-danger" onclick="confirmDel('${s.id}','误建排课','schedule')">误建删除</button>`:''}<button class="tms-btn tms-btn-primary" id="scheduleSaveBtn" onclick="saveSchedule()">保存</button>`;
  setCourtModalFrame(id?'编辑排课':'添加排课',body,footer,'modal-wide');
  updateSchClassHint();
  setScheduleStudentSelection(selectedStudentIds,false,!id);
  updateScheduleStudentSummary(selectedStudentIds);
  toggleScheduleCancelReason();
  toggleScheduleLocationType();
  refreshSchEntitlementOptions();
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
  openScheduleModal(id);
  const status=document.getElementById('sch_status');
  if(status)status.value='已取消';
  toggleScheduleCancelReason();
  const advanced=document.querySelector('.schedule-advanced');
  if(advanced)advanced.open=true;
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
  if(cls.coach)setCourtDropdownValue('sch_coach',cls.coach,cls.coach);
  if(cls.campus)setCourtDropdownValue('sch_campus',cls.campus,cn(cls.campus)||cls.campus);
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
function coachLateSettlementRows(month){
  return schedules.filter(s=>s.coachLateFree&&String(s.startTime||'').slice(0,7)===(month||today().slice(0,7))).sort((a,b)=>String(a.startTime||'').localeCompare(String(b.startTime||'')));
}
function openCoachLateSettlementModal(month=today().slice(0,7)){
  const rows=coachLateSettlementRows(month);
  const total=rows.reduce((sum,s)=>sum+(parseFloat(s.coachLateFieldFeeAmount)||0),0);
  const lateMinutes=rows.reduce((sum,s)=>sum+(parseInt(s.lateMinutes)||0),0);
  const body=`<div class="late-settlement-head"><div class="tms-form-item"><label class="tms-form-label">月份</label><input class="finput tms-form-control" id="coachLateMonth" type="month" value="${esc(month)}" onchange="openCoachLateSettlementModal(this.value)"></div></div><div class="tms-readonly-panel late-settlement-summary"><div class="late-settlement-card"><div class="late-settlement-label">迟到次数</div><div class="late-settlement-value">${rows.length}<span> 次</span></div></div><div class="late-settlement-card"><div class="late-settlement-label">迟到分钟</div><div class="late-settlement-value">${lateMinutes}<span> 分钟</span></div></div><div class="late-settlement-card"><div class="late-settlement-label">承担合计</div><div class="late-settlement-value">¥${fmt(total)}</div></div></div><div class="tms-audit-note late-settlement-note">只统计已标记「教练迟到免费」的排课，用于月底让教练承担场地费。</div><div class="tms-table-card late-settlement-table"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="width:110px;padding-left:20px">日期</th><th style="width:120px">时间</th><th style="width:110px">教练</th><th style="width:130px">学员</th><th>校区/场地</th><th style="width:90px">迟到</th><th style="width:110px;text-align:right;padding-right:20px">承担金额</th></tr></thead><tbody>${rows.map(s=>`<tr><td style="padding-left:20px">${esc(String(s.startTime||'').slice(0,10))}</td><td>${esc(String(s.startTime||'').slice(11,16))}-${esc(String(s.endTime||'').slice(11,16))}</td><td>${esc(s.coach||'-')}</td><td>${esc(s.studentName||scheduleStudentSummary(s)||'-')}</td><td>${esc(scheduleLocationText(s))}</td><td>${parseInt(s.lateMinutes)||0} 分钟</td><td style="text-align:right;padding-right:20px">¥${fmt(parseFloat(s.coachLateFieldFeeAmount)||0)}</td></tr>`).join('')||'<tr><td colspan="7"><div class="late-settlement-empty">本月暂无迟到记录</div></td></tr>'}</tbody></table></div></div>`;
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
    scheduleSource:'循环排课'
  }));
}
async function refreshSchEntitlementOptions(){
  const sel=document.getElementById('sch_entitlement'),hint=document.getElementById('sch_ent_hint');
  if(!sel||!hint)return;
  const ids=parseArr(document.getElementById('sch_stuIds')?.value||'[]');
  const startRaw=scheduleComposeDateTime('sch_date','sch_startTime');
  const endRaw=scheduleComposeDateTime('sch_date','sch_endTime');
  if(!ids.length||!startRaw||!endRaw){sel.innerHTML='<option value="">— 先选本次参与人和时间 —</option>';hint.textContent='';return;}
  if(ids.length>1){sel.innerHTML='<option value="">— 系统按参与学员自动扣课 —</option>';hint.textContent='多人班次会按勾选的参与学员分别扣各自可用课包，未勾选学员不扣课。';return;}
  try{
    const res=await apiCall('POST','/entitlements/recommend',{studentIds:ids,courseType:document.getElementById('sch_courseType')?.value||'',coach:document.getElementById('sch_coach')?.value||'',coachId:document.getElementById('sch_coach')?.value||'',campus:document.getElementById('sch_campus')?.value||'',startTime:startRaw,endTime:endRaw,lessonCount:parseInt(document.getElementById('sch_lc')?.value)||1,status:document.getElementById('sch_status')?.value||'已排课'});
    sel.innerHTML=(res.options||[]).filter(x=>x.selectable).map(x=>`<option value="${x.entitlementId}"${(document.getElementById('sch_entitlement').dataset.keep||document.getElementById('sch_entitlement').value||'')===x.entitlementId?' selected':''}>${esc(x.packageName)} · 剩余${x.remainingLessons}/${x.totalLessons} · ${esc(x.timeBand)||'全天'} · 到期${esc(x.validUntil)||'—'}</option>`).join('')||'<option value="">— 无可用课包 —</option>';
    hint.textContent=res.recommended?`推荐课包：${res.recommended.packageName}，剩余 ${res.recommended.remainingLessons}/${res.recommended.totalLessons}，${res.recommended.timeBand||'全天'}，到期 ${res.recommended.validUntil||'—'}`:'当前没有可用课包';
  }catch(e){sel.innerHTML='<option value="">— 无可用课包 —</option>';hint.textContent=e.message;}
}
function scheduleSaveConfirmText(data,selectedEntitlement){
  return [
    '确认保存这节课？',
    `本次参与：${scheduleStudentTextByIds(data.studentIds)||'—'}`,
    parseArr(data.absentStudentIds).length?`本次缺勤：${scheduleStudentTextByIds(data.absentStudentIds)}`:'',
    `时间：${fmtDt(data.startTime)} - ${fmtDt(data.endTime)}`,
    `教练：${data.coach||'—'}`,
    `校区/场地：${scheduleLocationText(data)}`,
    `班次：${data.classId?scheduleClassName(data):'—'}`,
    `课程：${normalizeCourseType(data.courseType)||'—'}`,
    `消课：${data.lessonCount||0} 节`,
    `扣减课包：${data.studentIds.length>1?'系统按参与学员自动扣课':(selectedEntitlement?selectedEntitlement.packageName:'未选择可用课包，本次不会扣减课包余额')}`,
    data.coachLateFree?`迟到免费：本节不扣学员课时，教练承担场地费 ¥${fmt(data.coachLateFieldFeeAmount||0)}`:'',
    data.status==='已取消'?`取消原因：${data.cancelReason||'未填写'}`:''
  ].join('\n');
}
async function saveSchedule(){
  const startTime=scheduleComposeDateTime('sch_date','sch_startTime');
  const endTime=scheduleComposeDateTime('sch_date','sch_endTime');
  const status=document.getElementById('sch_status')?.value||'已排课';
  if(!startTime){toast('请选择上课时间','warn');return;}
  if(status!=='已取消'&&!endTime){toast('请选择下课时间，系统需要用它校验冲突','warn');return;}
  if(endTime&&endTime<=startTime){toast('下课时间不能早于上课时间','warn');return;}
  if(endTime&&startTime.slice(0,10)!==endTime.slice(0,10)){toast('上课时间不能跨天','warn');return;}
  const classId=document.getElementById('sch_classId').value;
  const lc=parseInt(document.getElementById('sch_lc').value)||1;
  const studentIds=parseArr(document.getElementById('sch_stuIds').value);
  const expectedStudentIds=parseArr(document.getElementById('sch_expectedStuIds')?.value||'[]');
  const expectedBase=expectedStudentIds.length?expectedStudentIds:studentIds;
  const absentStudentIds=expectedBase.filter(id=>!studentIds.includes(id));
  const selectedEntitlementId=document.getElementById('sch_entitlement').value;
  if(!studentIds.length){toast('请先从学员库中选择学员','warn');return;}
  const coach=document.getElementById('sch_coach').value;
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
  const cancelReason=document.getElementById('sch_cancelReason')?.value||'';
  if(status==='已取消'&&!cancelReason){toast('请选择取消原因','warn');return;}
  const selectedCourseType=normalizeCourseType(document.getElementById('sch_courseType').value);
  const coachLateFree=!!document.getElementById('sch_coachLateFree')?.checked;
  const lateReason=document.getElementById('sch_lateReason')?.value.trim()||'';
  if(coachLateFree&&!lateReason){toast('请填写迟到原因','warn');return;}
  const data={startTime,endTime,classId,studentIds,expectedStudentIds:expectedBase,absentStudentIds,studentName:scheduleStudentTextByIds(studentIds).replace(/（[^）]*）/g,''),courseType:selectedCourseType,isTrial:selectedCourseType==='体验课',coach,coachId:coach,locationType,venue,campus:campusValue,externalVenueName:locationType==='external'?externalVenueName:'',externalCourtName:locationType==='external'?externalCourtName:'',externalNotes:locationType==='external'?externalNotes:'',lessonCount:lc,status,entitlementId:studentIds.length===1?selectedEntitlementId:'',packageName:studentIds.length===1?(selectedEntitlement?.packageName||''):'',purchaseId:studentIds.length===1?(selectedEntitlement?.purchaseId||''):'',timeBand:studentIds.length===1?(selectedEntitlement?.timeBand||''):'',cancelReason,notifyStatus:'',confirmStatus:'',scheduleSource:document.getElementById('sch_scheduleSource')?.value||'排课表',coachLateFree,lateMinutes:parseInt(document.getElementById('sch_lateMinutes')?.value)||0,lateReason,coachLateFieldFeeAmount:parseFloat(document.getElementById('sch_lateFieldFee')?.value)||0,coachLateHandledAt:coachLateFree?new Date().toISOString():'',coachLateHandledBy:coachLateFree?(currentUser?.name||''):'',notes:document.getElementById('sch_notes').value.trim()};
  if(!window.confirm(scheduleSaveConfirmText(data,selectedEntitlement)))return;
  const btn=document.getElementById('scheduleSaveBtn');if(btn){btn.disabled=true;btn.textContent='保存中…';}
  try{
    let result;
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
    closeModal();toast(editId?'修改成功 ✓':'排课成功 ✓','success');
    if(result?.warnings?.length)toast(result.warnings.join('；'),'warn');
    renderSchedule();renderClasses();renderPlans();renderCoachOps();renderMySchedule();
  }catch(e){toast('保存失败：'+e.message,'error');btn.disabled=false;btn.textContent='保存';}
}
function scheduleRemainingLessons(s){
  const cls=s?.classId?classes.find(c=>c.id===s.classId):null;
  if(!cls)return '';
  return Math.max(0,(parseInt(cls.totalLessons)||0)-(parseInt(cls.usedLessons)||0));
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
  document.getElementById('mBody').innerHTML=`<div style="background:rgba(217,119,6,0.08);border:0.5px solid rgba(217,119,6,0.2);border-radius:9px;padding:10px 13px;font-size:12px;color:var(--ts);margin-bottom:12px">${fmtDt(s.startTime)} · ${esc(scheduleStudentSummary(s))} · ${esc(s.coach)||'—'} · ${esc(scheduleLocationText(s))} · ${scheduleCourseType(s)}</div><div class="sec-ttl">反馈内容</div><div class="fgrid"><div class="fg full"><div class="flabel">今天练习了 *</div><textarea class="finput ftextarea" id="fb_practiced">${esc(fb.practicedToday||fb.template?.focus||fb.performance)}</textarea></div><div class="fg full"><div class="flabel">练习情况（非必填）</div><textarea class="finput ftextarea" id="fb_knowledge">${esc(fb.knowledgePoint||fb.problems)}</textarea></div><div class="fg full"><div class="flabel">下次练习 *</div><textarea class="finput ftextarea" id="fb_next_training">${esc(fb.nextTraining||fb.nextAdvice)}</textarea></div></div>${trialFieldsHtml}<div class="mactions"><button class="btn-cancel" onclick="closeModal()">取消</button>${posterBtn}<button class="btn-save" onclick="saveFeedback('${s.id}')">保存反馈</button></div>`;
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
  const cls=s.classId?classes.find(c=>c.id===s.classId):null;
  const fb=scheduleFeedback(s);
  const ent=findEntitlementForSchedule(s);
  const studentNames=scheduleStudentSummary(s);
  const stuRecords=parseArr(s.studentIds).map(id=>students.find(st=>st.id===id)).filter(Boolean);
  const primaryCoachText=[...new Set(stuRecords.map(st=>studentPrimaryCoachText(st)).filter(Boolean))].join('、')||'未分配';
  const ownerCoachText=[...new Set(stuRecords.map(st=>myStudentOwnerCoachText(st)).filter(Boolean))].join('、')||'未设置';
  const studentNotes=stuRecords.map(st=>st.notes).filter(Boolean).join('；');
  const recentFeedback=stuRecords.flatMap(st=>feedbacks.filter(item=>item.studentId===st.id||parseArr(item.studentIds).includes(st.id))).filter(item=>item.id!==fb?.id).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,2);
  const trialSummary=fb&&scheduleIsTrial(s)?`<div class="sec-ttl">体验课内部记录</div><div class="fgrid"><div class="fg"><div class="flabel">学员水平</div><div class="finput">${esc(fb.playerLevel)||'—'}</div></div><div class="fg"><div class="flabel">转化意愿</div><div class="finput">${esc(fb.conversionIntent)||'—'}</div></div><div class="fg"><div class="flabel">推荐产品</div><div class="finput">${esc(fb.recommendedProductType)||'—'}</div></div><div class="fg"><div class="flabel">是否需要跟进</div><div class="finput">${fb.needOpsFollowUp?'是':'否'}</div></div></div>`:'';
  const lateSummary=s.coachLateFree?`<div class="tms-section-header">教练迟到处理</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">处理结果</label><input class="finput tms-form-control" value="本节免费，不扣学员课时" readonly></div><div class="tms-form-item"><label class="tms-form-label">迟到分钟</label><input class="finput tms-form-control" value="${parseInt(s.lateMinutes)||0} 分钟" readonly></div><div class="tms-form-item"><label class="tms-form-label">教练承担场地费</label><input class="finput tms-form-control" value="¥${fmt(parseFloat(s.coachLateFieldFeeAmount)||0)}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">原因</label><div class="finput tms-form-control" style="height:auto;min-height:42px;white-space:normal;line-height:1.7">${esc(s.lateReason)||'—'}</div></div></div>`:'';
  const body=`<div class="tms-section-header" style="margin-top:0;">课程基础信息</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">时间</label><input class="finput tms-form-control" value="${fmtDt(s.startTime)}${s.endTime?` - ${fmtDt(s.endTime)}`:''}" readonly></div><div class="tms-form-item"><label class="tms-form-label">校区 / 场地</label><input class="finput tms-form-control" value="${esc(scheduleLocationText(s))}" readonly></div></div>${isExternalSchedule(s)&&s.externalNotes?`<div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">外部场馆说明</label><input class="finput tms-form-control" value="${esc(s.externalNotes)}" readonly></div></div>`:''}<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">课程类型</label><input class="finput tms-form-control" value="${scheduleCourseType(s)||esc(ent?.courseType)||'-'}" readonly></div><div class="tms-form-item"><label class="tms-form-label">班次</label><input class="finput tms-form-control" value="${esc(scheduleClassName(s))}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">学员</label><input class="finput tms-form-control" value="${esc(studentNames)}" readonly></div><div class="tms-form-item"><label class="tms-form-label">状态</label><input class="finput tms-form-control" value="${scheduleStatusLabel(effectiveScheduleStatus(s))}${s.cancelReason?` · ${esc(s.cancelReason)}`:''}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">负责教练</label><input class="finput tms-form-control" value="${esc(primaryCoachText)}" readonly></div><div class="tms-form-item"><label class="tms-form-label">归属教练</label><input class="finput tms-form-control" value="${esc(ownerCoachText)}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">课包 / 权益</label><input class="finput tms-form-control" value="${esc(scheduleEntitlementSummary(s))}" readonly></div><div class="tms-form-item"><label class="tms-form-label">排课来源</label><input class="finput tms-form-control" value="${esc(s.scheduleSource||'排课表')}" readonly></div></div><div class="tms-section-header">上课前信息</div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">学员备注</label><div class="finput tms-form-control tms-readonly-text">${esc(studentNotes)||'-'}</div></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">历史问题</label><div class="finput tms-form-control tms-readonly-text">${esc(recentFeedback.map(item=>item.knowledgePoint||item.practicedToday).filter(Boolean).join('；'))||'-'}</div></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">教练备注 / 本节关注点</label><div class="finput tms-form-control tms-readonly-text">${esc(s.notes)||'-'}${fb?.nextTraining?`<br>${esc(fb.nextTraining)}`:''}</div></div></div><div class="tms-section-header">课后动作</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">消耗课时</label><input class="finput tms-form-control" value="${parseInt(s.lessonCount)||0} 节" readonly></div><div class="tms-form-item"><label class="tms-form-label">班次剩余课时</label><input class="finput tms-form-control" value="${scheduleRemainingLessons(s)===''?'-':scheduleRemainingLessons(s)+' 节'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">反馈摘要</label><div class="finput tms-form-control tms-readonly-text">${feedbackSummaryHtml(fb)}</div></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">历史反馈</label><div class="finput tms-form-control tms-readonly-text">${recentFeedback.length?recentFeedback.map(item=>`${String(item.updatedAt||'').slice(0,10)}：${item.practicedToday||item.knowledgePoint||'已填写'}`).map(esc).join('<br>'):'-'}</div></div></div>${lateSummary}${trialSummary}`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">关闭</button><button class="tms-btn tms-btn-primary" onclick="openFeedbackModal('${s.id}')">${fb?'查看/编辑反馈':'填写反馈'}</button>`;
  setCourtModalFrame('排课详情',body,footer,'modal-wide');
}
