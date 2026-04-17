// ===== 排课表 =====
function syncScheduleFilterOptions(){
  const statusValue=document.getElementById('schStatusFilter')?.value||'';
  const campusValue=document.getElementById('schCampusFilter')?.value||'';
  const courseTypeValue=document.getElementById('schCourseTypeFilter')?.value||'';
  const statusOptions=[{value:'',label:'全部状态'},{value:'已排课',label:'已排课'},{value:'已结束',label:'已结束'},{value:'已取消',label:'已取消'}];
  const campusOptions=[{value:'',label:'全部校区'},...campuses.map(c=>({value:c.code||c.id,label:c.name||c.code||c.id}))];
  const courseTypeOptions=[{value:'',label:'全部课程类型'},...PRODUCT_TYPES.map(t=>({value:t,label:t}))];
  [['schStatusFilterHost','schStatusFilter','全部状态',statusOptions,statusValue],['schCampusFilterHost','schCampusFilter','全部校区',campusOptions,campusValue],['schCourseTypeFilterHost','schCourseTypeFilter','全部课程类型',courseTypeOptions,courseTypeValue]].forEach(([hostId,id,label,options,value])=>{
    const host=document.getElementById(hostId);
    if(host)host.innerHTML=renderCourtDropdownHtml(id,label,options,value,false,'renderSchedule');
  });
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
    if(!searchHit(q,s.studentName,stuText,s.coach,s.venue,effectiveStatus,cn(s.campus),s.notes,cls?.className,cls?.productName,fmtDt(s.startTime),fmtDt(s.endTime),s.notifyStatus,s.cancelReason,s.scheduleSource))return false;
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
  const ss={'已排课':'tms-tag-tier-blue','已结束':'tms-tag-green','已取消':'tms-tag-tier-slate'};
  document.getElementById('schTbody').innerHTML=slice.length?slice.map(s=>{
    const fb=scheduleFeedback(s);
    const status=s._effectiveStatus||effectiveScheduleStatus(s);
    const dateText=String(s.startTime||'').slice(0,10)||'—';
    const timeText=s.startTime?`${s.startTime.slice(11,16)}-${(s.endTime||'').slice(11,16)}`:'—';
    return `<tr><td style="padding-left:20px">${renderCourtCellText(dateText,false)}</td><td>${renderCourtCellText(timeText,false)}</td><td>${renderCourtCellText(scheduleDurationText(s),false)}</td><td><div class="tms-cell-text">${esc(cn(s.campus)||'-')} · ${esc(s.venue)||'—'}</div></td><td>${renderCourtCellText(s.coach,false)}</td><td><div class="tms-text-primary">${esc(scheduleListStudentSummary(s))}</div></td><td><span class="tms-tag ${productTypeTagClass(scheduleCourseType(s))}">${esc(scheduleCourseType(s))}</span></td><td><span class="tms-action-link" onclick="openFeedbackModal('${s.id}')">${scheduleFeedbackStatusText(s)}</span></td><td><span class="tms-tag ${ss[status]||'tms-tag-tier-slate'}">${status||'已排课'}</span>${status==='已取消'&&s.cancelReason?`<div class="tms-text-secondary" style="margin-top:6px">${esc(s.cancelReason)}</div>`:''}</td><td class="tms-sticky-r tms-action-cell" style="width:220px;padding-right:20px"><span class="tms-action-link" onclick="openScheduleDetail('${s.id}')">查看</span><span class="tms-action-link" onclick="openScheduleModal('${s.id}')">编辑</span><span class="tms-action-link" onclick="openCancelScheduleModal('${s.id}')">取消</span>${scheduleCanDeleteMistake(s)?`<span class="tms-action-link" onclick="confirmDel('${s.id}','误建排课','schedule')">删除</span>`:''}</td></tr>`;
  }).join(''):'<tr><td colspan="10"><div class="empty"><div class="empty-ico">📅</div><p>暂无排课</p></div></td></tr>';
}
function scheduleStudentTextByIds(ids){
  return parseArr(ids).map(id=>{
    const student=students.find(s=>s.id===id);
    if(!student)return id;
    return student.phone?`${student.name}（${student.phone}）`:student.name;
  }).join('、');
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
function setScheduleStudentSelection(ids,keepKeyword=false){
  const normalized=[...new Set(parseArr(ids).filter(Boolean))];
  const hidden=document.getElementById('sch_stuIds');
  if(hidden)hidden.value=JSON.stringify(normalized);
  updateScheduleStudentSummary(normalized);
  const host=document.getElementById('sch_stuPickerWrap');
  if(host){
    const keyword=keepKeyword?(document.getElementById('sch_stuSearch')?.value||''):'';
    host.innerHTML=renderScheduleStudentPicker(normalized,keyword);
  }
}
function applyScheduleStudentFilter(){
  const ids=parseArr(document.getElementById('sch_stuIds')?.value||'[]');
  setScheduleStudentSelection(ids,true);
}
function syncSelectedStudentsFromPicker(){
  const ids=[...document.querySelectorAll('.sch-stu-cb:checked')].map(o=>o.value).filter(Boolean);
  const hidden=document.getElementById('sch_stuIds');
  if(hidden)hidden.value=JSON.stringify(ids);
  updateScheduleStudentSummary(ids);
}
function toggleScheduleStudentCheckbox(){
  syncSelectedStudentsFromPicker();
  refreshSchEntitlementOptions();
}
// schedule modal field ids: id="sch_date" id="sch_startTime" id="sch_endTime" id="sch_cancelReason" id="sch_notifyStatus" id="sch_scheduleSource"
function openScheduleModal(id,seed={}){
  editId=id;const s=id?schedules.find(x=>x.id===id):(seed||null);
  const classOptions=[{value:'',label:'— 不关联 —'},...classes.filter(c=>c.status==='已排班').map(c=>{const rem=(parseInt(c.totalLessons)||0)-(parseInt(c.usedLessons)||0);return {value:c.id,label:`${c.className} 剩余${rem}节`};})];
  const courseTypeOptions=PRODUCT_TYPES.map(t=>({value:t,label:t}));
  const coachOptions=[{value:'',label:'— 选择 —'},...activeCoachNames().map(c=>({value:c,label:c}))];
  const campusOptions=[{value:'',label:'— 选择 —'},...campuses.map(c=>({value:c.code||c.id,label:c.name||c.code||c.id}))];
  const venueOptions=['1号场','2号场','3号场','4号场'].map(v=>({value:v,label:v}));
  const statusOptions=SCH_STATUSES.map(t=>({value:t,label:t}));
  const cancelOptions=[{value:'',label:'— 未取消 —'},...SCH_CANCEL_REASONS.map(t=>({value:t,label:t}))];
  const notifyOptions=SCH_NOTIFY_STATUSES.map(t=>({value:t,label:t}));
  const confirmOptions=SCH_CONFIRM_STATUSES.map(t=>({value:t,label:t}));
  const selectedStudentIds=parseArr(rv(s,'studentIds','[]'));
  const expectedStudentIds=parseArr(rv(s,'expectedStudentIds','[]')).length?parseArr(rv(s,'expectedStudentIds','[]')):selectedStudentIds;
  const startRaw=String(rv(s,'startTime',seed.startTime||'')).trim().replace(' ','T');
  const endRaw=String(rv(s,'endTime',seed.endTime||'')).trim().replace(' ','T');
  const dateValue=startRaw?startRaw.slice(0,10):(endRaw?endRaw.slice(0,10):today());
  const startTimeValue=startRaw&&startRaw.length>=16?startRaw.slice(11,16):(seed.startTime?String(seed.startTime).slice(11,16):'09:00');
  const endTimeValue=endRaw&&endRaw.length>=16?endRaw.slice(11,16):(seed.endTime?String(seed.endTime).slice(11,16):'10:00');
  const body=`<input type="hidden" id="sch_stuIds" value="${rv(s,'studentIds','[]')}"><input type="hidden" id="sch_expectedStuIds" value="${esc(JSON.stringify(expectedStudentIds))}"><input type="hidden" id="sch_scheduleSource" value="${rv(s,'scheduleSource',seed.scheduleSource||'排课表')}"><div class="tms-audit-note" style="margin-bottom:18px;color:#8C5C3A;background:rgba(217,119,6,0.12)">排课会校验时间冲突；关联班次后默认勾选全员，取消勾选的人本次记为缺勤，不扣课时。</div><div class="tms-section-header" style="margin-top:0;">排课信息</div><div class="tms-form-row"><div class="tms-form-item" style="flex:0 0 34%"><label class="tms-form-label">关联班次</label>${renderCourtDropdownHtml('sch_classId','关联班次',classOptions,rv(s,'classId'),true,'onSchClassChange')}<div id="sch_class_hint" style="font-size:12px;color:var(--ts);margin-top:8px"></div></div><div class="tms-form-item" style="flex:1"><label class="tms-form-label">本次参与人 *</label><input class="finput tms-form-control" id="sch_stuSearch" placeholder="搜索姓名 / 手机号 / 校区" oninput="applyScheduleStudentFilter()"><div id="sch_stuPickerWrap" style="margin-top:8px">${renderScheduleStudentPicker(selectedStudentIds)}</div><div id="sch_stuSummary" style="font-size:12px;color:var(--ts);margin-top:8px">${esc(scheduleStudentTextByIds(selectedStudentIds)||'未选择学员')}</div></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">上课日期与时间 *</label>${scheduleTimeRangeControls(dateValue,startTimeValue,endTimeValue)}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">课程类型</label>${renderCourtDropdownHtml('sch_courseType','课程类型',courseTypeOptions,normalizeCourseType(rv(s,'courseType')||seed.courseType)||PRODUCT_TYPES[0],true,'refreshSchEntitlementOptions')}</div><div class="tms-form-item"><label class="tms-form-label">消课节数</label><input class="finput tms-form-control" id="sch_lc" type="number" value="${rv(s,'lessonCount',seed.lessonCount||1)}" onchange="refreshSchEntitlementOptions()"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">教练 *</label>${renderCourtDropdownHtml('sch_coach','教练',coachOptions,rv(s,'coach')||seed.coach,true,'refreshSchEntitlementOptions')}</div><div class="tms-form-item"><label class="tms-form-label">校区 *</label>${renderCourtDropdownHtml('sch_campus','校区',campusOptions,rv(s,'campus')||seed.campus,true,'refreshSchEntitlementOptions')}</div><div class="tms-form-item"><label class="tms-form-label">场地 *</label>${renderCourtDropdownHtml('sch_venue','场地',venueOptions,rv(s,'venue','1号场'),true)}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">扣减课包</label><select class="finput tms-form-control" id="sch_entitlement"><option value="${rv(s,'entitlementId','')}">${rv(s,'packageName','— 自动推荐可用课包 —')||'— 自动推荐可用课包 —'}</option></select><div id="sch_ent_hint" style="font-size:12px;color:var(--ts);margin-top:8px"></div></div><div class="tms-form-item"><label class="tms-form-label">状态</label>${renderCourtDropdownHtml('sch_status','状态',statusOptions,rv(s,'status','已排课'),true,'toggleScheduleCancelReason')}</div><div class="tms-form-item"><label class="tms-form-label">取消原因</label>${renderCourtDropdownHtml('sch_cancelReason','取消原因',cancelOptions,rv(s,'cancelReason'),true)}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">通知状态</label>${renderCourtDropdownHtml('sch_notifyStatus','通知状态',notifyOptions,rv(s,'notifyStatus','未通知'),true)}</div><div class="tms-form-item"><label class="tms-form-label">确认状态</label>${renderCourtDropdownHtml('sch_confirmStatus','确认状态',confirmOptions,rv(s,'confirmStatus','待确认'),true)}</div><div class="tms-form-item"><label class="tms-form-label">排课来源</label><input class="finput tms-form-control" value="${esc(rv(s,'scheduleSource',seed.scheduleSource||'排课表'))}" readonly></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" id="sch_notes">${esc(rv(s,'notes'))}</textarea></div></div>`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button>${id&&scheduleCanDeleteMistake(s)?`<button class="tms-btn tms-btn-danger" onclick="confirmDel('${s.id}','误建排课','schedule')">误建删除</button>`:''}<button class="tms-btn tms-btn-primary" id="scheduleSaveBtn" onclick="saveSchedule()">保存</button>`;
  setCourtModalFrame(id?'编辑排课':'添加排课',body,footer,'modal-wide');
  updateSchClassHint();
  setScheduleStudentSelection(selectedStudentIds);
  updateScheduleStudentSummary(selectedStudentIds);
  toggleScheduleCancelReason();
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
  setCourtDropdownValue('sch_status','已取消','已取消');
  toggleScheduleCancelReason();
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
    `校区/场地：${cn(data.campus)||'—'} · ${data.venue||'—'}`,
    `班次：${data.classId?scheduleClassName(data):'—'}`,
    `课程：${normalizeCourseType(data.courseType)||'—'}`,
    `消课：${data.lessonCount||0} 节`,
    `扣减课包：${data.studentIds.length>1?'系统按参与学员自动扣课':(selectedEntitlement?selectedEntitlement.packageName:'未选择可用课包，本次不会扣减课包余额')}`,
    data.status==='已取消'?`取消原因：${data.cancelReason||'未填写'}`:`通知：${data.notifyStatus||'未通知'}`
  ].join('\n');
}
async function saveSchedule(){
  const startTime=scheduleComposeDateTime('sch_date','sch_startTime');
  const endTime=scheduleComposeDateTime('sch_date','sch_endTime');
  const status=document.getElementById('sch_status').value;
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
  const campusValue=document.getElementById('sch_campus').value;
  const venue=document.getElementById('sch_venue').value.trim();
  if(!coach){toast('请选择教练','warn');return;}
  if(!campusValue){toast('请选择校区','warn');return;}
  if(!venue){toast('请选择场地','warn');return;}
  const selectedEntitlement=entitlements.find(x=>x.id===selectedEntitlementId);
  const cancelReason=document.getElementById('sch_cancelReason')?.value||'';
  if(status==='已取消'&&!cancelReason){toast('请选择取消原因','warn');return;}
  const selectedCourseType=normalizeCourseType(document.getElementById('sch_courseType').value);
  const data={startTime,endTime,classId,studentIds,expectedStudentIds:expectedBase,absentStudentIds,studentName:scheduleStudentTextByIds(studentIds).replace(/（[^）]*）/g,''),courseType:selectedCourseType,isTrial:selectedCourseType==='体验课',coach,coachId:coach,venue,campus:campusValue,lessonCount:lc,status,entitlementId:studentIds.length===1?selectedEntitlementId:'',packageName:studentIds.length===1?(selectedEntitlement?.packageName||''):'',purchaseId:studentIds.length===1?(selectedEntitlement?.purchaseId||''):'',timeBand:studentIds.length===1?(selectedEntitlement?.timeBand||''):'',cancelReason,notifyStatus:document.getElementById('sch_notifyStatus')?.value||'未通知',confirmStatus:document.getElementById('sch_confirmStatus')?.value||'待确认',scheduleSource:document.getElementById('sch_scheduleSource')?.value||'排课表',notes:document.getElementById('sch_notes').value.trim()};
  if(!window.confirm(scheduleSaveConfirmText(data,selectedEntitlement)))return;
  const btn=document.getElementById('scheduleSaveBtn');if(btn){btn.disabled=true;btn.textContent='保存中…';}
  try{
    let result;
    if(editId){
      result=await apiCall('PUT','/schedule/'+editId,data);
    }else{
      result=await apiCall('POST','/schedule',data);
    }
    mergeScheduleSaveResult(result,editId);
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
function openFeedbackModal(scheduleId){
  const s=schedules.find(x=>x.id===scheduleId);if(!s){toast('找不到排课记录','error');return;}
  const fb=scheduleFeedback(s)||{};
  const trial=scheduleIsTrial(s);
  editId=fb.id||null;
  document.getElementById('mTitle').textContent=fb.id?'编辑课后反馈':'课后反馈';
  document.getElementById('mBody').innerHTML=`<div style="background:rgba(217,119,6,0.08);border:0.5px solid rgba(217,119,6,0.2);border-radius:9px;padding:10px 13px;font-size:12px;color:var(--ts);margin-bottom:12px">${fmtDt(s.startTime)} · ${esc(scheduleStudentSummary(s))} · ${esc(s.coach)||'—'} · ${cn(s.campus)} ${esc(s.venue)||''} · ${scheduleCourseType(s)}</div><div class="sec-ttl">反馈内容</div><div class="fgrid"><div class="fg full"><div class="flabel">今天练习了 *</div><textarea class="finput ftextarea" id="fb_practiced">${esc(fb.practicedToday||fb.template?.focus||fb.performance)}</textarea></div><div class="fg full"><div class="flabel">知识点（非必填）</div><textarea class="finput ftextarea" id="fb_knowledge">${esc(fb.knowledgePoint||fb.problems)}</textarea></div><div class="fg full"><div class="flabel">下节课我们训练 *</div><textarea class="finput ftextarea" id="fb_next_training">${esc(fb.nextTraining||fb.nextAdvice)}</textarea></div></div><div class="sec-ttl">体验课转化判断</div><div class="fgrid"><div class="fg"><div class="flabel">学员水平</div><select class="fselect" id="fb_player_level"><option value="">未判断</option><option value="零基础"${fb.playerLevel==='零基础'?' selected':''}>零基础</option><option value="初学"${fb.playerLevel==='初学'?' selected':''}>初学</option><option value="有基础"${fb.playerLevel==='有基础'?' selected':''}>有基础</option><option value="长期打球"${fb.playerLevel==='长期打球'?' selected':''}>长期打球</option></select></div><div class="fg"><div class="flabel">目标类型</div><select class="fselect" id="fb_goal_type"><option value="">未判断</option><option value="健身"${fb.goalType==='健身'?' selected':''}>健身</option><option value="入门"${fb.goalType==='入门'?' selected':''}>入门</option><option value="提升技术"${fb.goalType==='提升技术'?' selected':''}>提升技术</option><option value="社交"${fb.goalType==='社交'?' selected':''}>社交</option><option value="比赛"${fb.goalType==='比赛'?' selected':''}>比赛</option><option value="陪练"${fb.goalType==='陪练'?' selected':''}>陪练</option></select></div><div class="fg"><div class="flabel">经验背景</div><select class="fselect" id="fb_experience_background"><option value="">未判断</option><option value="无经验"${fb.experienceBackground==='无经验'?' selected':''}>无经验</option><option value="有少量体验课"${fb.experienceBackground==='有少量体验课'?' selected':''}>有少量体验课</option><option value="打球半年内"${fb.experienceBackground==='打球半年内'?' selected':''}>打球半年内</option><option value="长期打球"${fb.experienceBackground==='长期打球'?' selected':''}>长期打球</option></select></div><div class="fg"><div class="flabel">转化意愿</div><select class="fselect" id="fb_conversion_intent"><option value="">未判断</option><option value="高"${fb.conversionIntent==='高'?' selected':''}>高</option><option value="中"${fb.conversionIntent==='中'?' selected':''}>中</option><option value="低"${fb.conversionIntent==='低'?' selected':''}>低</option></select></div><div class="fg"><div class="flabel">推荐产品类型</div><select class="fselect" id="fb_recommended_product_type"><option value="">未推荐</option><option value="场地会员"${fb.recommendedProductType==='场地会员'?' selected':''}>场地会员</option><option value="私教课"${fb.recommendedProductType==='私教课'?' selected':''}>私教课</option><option value="体验课"${fb.recommendedProductType==='体验课'?' selected':''}>体验课</option><option value="训练营"${fb.recommendedProductType==='训练营'?' selected':''}>训练营</option><option value="大师课"${fb.recommendedProductType==='大师课'?' selected':''}>大师课</option><option value="继续观察"${fb.recommendedProductType==='继续观察'?' selected':''}>继续观察</option></select></div><div class="fg"><div class="flabel">是否需要运营跟进</div><select class="fselect" id="fb_need_ops_follow_up"><option value="否"${fb.needOpsFollowUp?'':' selected'}>否</option><option value="是"${fb.needOpsFollowUp?' selected':''}>是</option></select></div><div class="fg"><div class="flabel">跟进优先级</div><select class="fselect" id="fb_ops_follow_up_priority"><option value="">未设置</option><option value="高"${fb.opsFollowUpPriority==='高'?' selected':''}>高</option><option value="中"${fb.opsFollowUpPriority==='中'?' selected':''}>中</option><option value="低"${fb.opsFollowUpPriority==='低'?' selected':''}>低</option></select></div><div class="fg full"><div class="flabel">主要问题</div><textarea class="finput ftextarea" id="fb_main_issues">${esc(fb.mainIssues)}</textarea></div><div class="fg full"><div class="flabel">推荐原因</div><textarea class="finput ftextarea" id="fb_recommended_reason">${esc(fb.recommendedReason)}</textarea></div><div class="fg full"><div class="flabel">跟进建议</div><textarea class="finput ftextarea" id="fb_ops_follow_up_suggestion">${esc(fb.opsFollowUpSuggestion)}</textarea></div></div><div class="mactions"><button class="btn-cancel" onclick="closeModal()">取消</button><button class="btn-sec" onclick="copyFeedbackDraft('${s.id}')">复制给学员</button><button class="btn-save" onclick="saveFeedback('${s.id}')">保存反馈</button></div>`;
  document.getElementById('overlay').classList.add('open');
}
function feedbackDraftText(s){
  const v=id=>document.getElementById(id)?.value.trim()||'';
  const lines=[`${s.studentName||'学员'} ${fmtDt(s.startTime)} 课后反馈`,`今天练习了：${v('fb_practiced')||'—'}`,`知识点：${v('fb_knowledge')||'—'}`,`下节课我们训练：${v('fb_next_training')||'—'}`];
  if(scheduleIsTrial(s)){
    lines.push(`学员水平：${v('fb_player_level')||'—'}`,`转化意愿：${v('fb_conversion_intent')||'—'}`,`推荐产品：${v('fb_recommended_product_type')||'—'}`,`是否需要运营跟进：${v('fb_need_ops_follow_up')||'否'}`);
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
  if(!practicedToday||!nextTraining){toast('请填写「今天练习了」和「下节课我们训练」','warn');btn.disabled=false;btn.textContent='保存反馈';return;}
  const data={scheduleId:s.id,studentId:studentIds[0]||'',studentIds,studentName:s.studentName||'',coach:s.coach||'',startTime:s.startTime||'',campus:s.campus||'',venue:s.venue||'',lessonCount:s.lessonCount||0,isTrial:scheduleIsTrial(s),remainingLessons:scheduleRemainingLessons(s),practicedToday,knowledgePoint:document.getElementById('fb_knowledge').value.trim(),nextTraining,playerLevel:document.getElementById('fb_player_level')?.value||'',goalType:document.getElementById('fb_goal_type')?.value||'',experienceBackground:document.getElementById('fb_experience_background')?.value||'',mainIssues:document.getElementById('fb_main_issues')?.value.trim()||'',conversionIntent:document.getElementById('fb_conversion_intent')?.value||'',recommendedProductType:document.getElementById('fb_recommended_product_type')?.value||'',recommendedReason:document.getElementById('fb_recommended_reason')?.value.trim()||'',needOpsFollowUp:(document.getElementById('fb_need_ops_follow_up')?.value||'否')==='是',opsFollowUpPriority:document.getElementById('fb_ops_follow_up_priority')?.value||'',opsFollowUpSuggestion:document.getElementById('fb_ops_follow_up_suggestion')?.value.trim()||''};
  try{
    const saved=editId?await apiCall('PUT','/feedbacks/'+editId,data):await apiCall('POST','/feedbacks',data);
    const i=feedbacks.findIndex(f=>f.id===saved.id);if(i>=0)feedbacks[i]=saved;else feedbacks.unshift(saved);
    closeModal();toast('反馈已保存 ✓','success');renderSchedule();renderCoachOps();renderWorkbench();renderMySchedule();renderMyStudents();
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
  const trialSummary=fb&&scheduleIsTrial(s)?`<div class="sec-ttl">4. 如果是体验课，增加“转化判断”</div><div class="fgrid"><div class="fg"><div class="flabel">学员水平</div><div class="finput">${esc(fb.playerLevel)||'—'}</div></div><div class="fg"><div class="flabel">当前目标</div><div class="finput">${esc(fb.goalType)||'—'}</div></div><div class="fg"><div class="flabel">经验背景</div><div class="finput">${esc(fb.experienceBackground)||'—'}</div></div><div class="fg"><div class="flabel">转化意愿</div><div class="finput">${esc(fb.conversionIntent)||'—'}</div></div><div class="fg"><div class="flabel">推荐产品</div><div class="finput">${esc(fb.recommendedProductType)||'—'}</div></div><div class="fg"><div class="flabel">是否需要运营跟进</div><div class="finput">${fb.needOpsFollowUp?'是':'否'}</div></div><div class="fg full"><div class="flabel">主要问题</div><div class="finput" style="min-height:42px">${esc(fb.mainIssues)||'—'}</div></div><div class="fg full"><div class="flabel">推荐原因</div><div class="finput" style="min-height:42px">${esc(fb.recommendedReason)||'—'}</div></div><div class="fg full"><div class="flabel">跟进建议</div><div class="finput" style="min-height:42px">${esc(fb.opsFollowUpSuggestion)||'—'}</div></div></div>`:'';
  const body=`<div class="tms-section-header" style="margin-top:0;">课程基础信息</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">时间</label><input class="finput tms-form-control" value="${fmtDt(s.startTime)}${s.endTime?` - ${fmtDt(s.endTime)}`:''}" readonly></div><div class="tms-form-item"><label class="tms-form-label">校区 / 场地</label><input class="finput tms-form-control" value="${cn(s.campus)||'—'} · ${esc(s.venue)||'—'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">课程类型</label><input class="finput tms-form-control" value="${scheduleCourseType(s)||esc(ent?.courseType)||'—'}" readonly></div><div class="tms-form-item"><label class="tms-form-label">班次</label><input class="finput tms-form-control" value="${esc(scheduleClassName(s))}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">学员</label><input class="finput tms-form-control" value="${esc(studentNames)}" readonly></div><div class="tms-form-item"><label class="tms-form-label">状态</label><input class="finput tms-form-control" value="${effectiveScheduleStatus(s)}${s.cancelReason?` · ${esc(s.cancelReason)}`:''}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">负责教练</label><input class="finput tms-form-control" value="${esc(primaryCoachText)}" readonly></div><div class="tms-form-item"><label class="tms-form-label">归属教练</label><input class="finput tms-form-control" value="${esc(ownerCoachText)}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">通知 / 确认</label><input class="finput tms-form-control" value="${esc(s.notifyStatus||'未通知')} · ${esc(s.confirmStatus||'待确认')}" readonly></div><div class="tms-form-item"><label class="tms-form-label">反馈状态</label><input class="finput tms-form-control" value="${scheduleFeedbackLabel(s)}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">课包 / 权益</label><input class="finput tms-form-control" value="${esc(scheduleEntitlementSummary(s))}" readonly></div><div class="tms-form-item"><label class="tms-form-label">排课来源</label><input class="finput tms-form-control" value="${esc(s.scheduleSource||'排课表')}" readonly></div></div><div class="tms-section-header">上课前信息</div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">学员备注</label><div class="finput tms-form-control" style="height:auto;min-height:52px;white-space:normal;line-height:1.7">${esc(studentNotes)||'—'}</div></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">历史问题</label><div class="finput tms-form-control" style="height:auto;min-height:52px;white-space:normal;line-height:1.7">${esc(recentFeedback.map(item=>item.mainIssues||item.knowledgePoint||item.practicedToday).filter(Boolean).join('；'))||'—'}</div></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">教练备注 / 本节关注点</label><div class="finput tms-form-control" style="height:auto;min-height:52px;white-space:normal;line-height:1.7">${esc(s.notes)||'—'}${fb?.nextTraining?`<br>${esc(fb.nextTraining)}`:''}</div></div></div><div class="tms-section-header">课后动作</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">消耗课时</label><input class="finput tms-form-control" value="${parseInt(s.lessonCount)||0} 节" readonly></div><div class="tms-form-item"><label class="tms-form-label">班次剩余课时</label><input class="finput tms-form-control" value="${scheduleRemainingLessons(s)===''?'—':scheduleRemainingLessons(s)+' 节'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">反馈摘要</label><div class="finput tms-form-control" style="height:auto;min-height:52px;white-space:normal;line-height:1.7">${feedbackSummaryHtml(fb)}</div></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">历史反馈</label><div class="finput tms-form-control" style="height:auto;min-height:52px;white-space:normal;line-height:1.7">${recentFeedback.length?recentFeedback.map(item=>`${String(item.updatedAt||'').slice(0,10)}：${item.practicedToday||item.knowledgePoint||item.mainIssues||'已填写'}`).map(esc).join('<br>'):'—'}</div></div></div>${trialSummary}`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">关闭</button><button class="tms-btn tms-btn-primary" onclick="openFeedbackModal('${s.id}')">${fb?'查看/编辑反馈':'填写反馈'}</button>`;
  setCourtModalFrame('排课详情',body,footer,'modal-wide');
}
