function scheduleStatusLabel(status){
  if(status==='已结束')return '已下课';
  if(status==='已排课')return '待上课';
  return status||'待上课';
}
function scheduleStatusTagClass(status){
  return status==='已排课'?'tms-tag-tier-blue':status==='已结束'?'tms-tag-tier-slate schedule-status-ended':status==='已取消'?'tms-tag-red':'tms-tag-tier-slate';
}
function scheduleVenueOptionsForCampus(campusCode){
  const rows=activeCampusVenueRows(campusCode);
  if(!rows.length)return VENUES.map(v=>({value:v,label:v}));
  return rows.map(v=>({value:v.id,label:v.name}));
}
function scheduleVenueByValue(campusCode,value){
  return campusVenueByValue(campusCode,value);
}
function scheduleVenueSelectValue(campusCode,value=''){
  const rows=activeCampusVenueRows(campusCode);
  const hit=rows.find(v=>String(v.id)===String(value||'')||String(v.name)===String(value||''));
  return hit?.id||value||rows[0]?.id||VENUES[0]||'';
}
function renderScheduleVenueField(campusCode,venueValue=''){
  const venueOptions=scheduleVenueOptionsForCampus(campusCode);
  const nextValue=scheduleVenueSelectValue(campusCode,venueValue);
  return renderStandardDropdownHtml('sch_venue','场地',venueOptions,nextValue,true,'handleScheduleVenueChange');
}
function syncScheduleVenueField(preserveValue=''){
  const host=document.getElementById('sch_venueFieldHost');
  if(!host)return;
  const currentValue=preserveValue||document.getElementById('sch_venue')?.value||'';
  const campusValue=document.getElementById('sch_campus')?.value||'';
  host.innerHTML=renderScheduleVenueField(campusValue,currentValue);
  updateScheduleCreateHeaderSubtitle();
}
function currentScheduleVenueText(){
  const type=document.getElementById('sch_locationType')?.value||'own';
  if(type==='external')return [document.getElementById('sch_externalVenueName')?.value.trim()||'',document.getElementById('sch_externalCourtName')?.value.trim()||''].filter(Boolean).join(' · ');
  const campusValue=document.getElementById('sch_campus')?.value||'',venueValue=document.getElementById('sch_venue')?.value.trim()||'',selectedVenue=scheduleVenueByValue(campusValue,venueValue);
  return selectedVenue?.name||venueValue;
}
function updateScheduleCreateHeaderSubtitle(){
  const el=document.getElementById('scheduleCreateSubtitle');
  if(!el)return;
  const start=scheduleComposeDateTime('sch_date','sch_startTime'),end=scheduleComposeDateTime('sch_date','sch_endTime');
  const timeText=start?`${fmtDt(start)}${end?` - ${String(end).slice(11,16)}`:''}`:'填写排课信息';
  el.textContent=[timeText,currentScheduleVenueText()].filter(Boolean).join(' · ');
}
var scheduleDetailActiveTab='info';
var scheduleDetailEditingSection='';
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
  if(type==='textarea'&&/^sd_fb_/.test(id)){
    return `<div class="schedule-detail-field full-width"><div class="schedule-detail-label">${esc(label)}</div><textarea class="schedule-detail-edit-control" id="${id}" ${feedbackListTextareaAttrs('sd_fb_list_style')}>${esc(value||'')}</textarea></div>`;
  }
  return renderDetailDrawerInput(label,id,value,type);
}
function renderScheduleDetailCard(title,content,{section='',scheduleId='',className='',actionLabel='编辑',feedbackId='',canCancelSchedule=false}={}){
  const editing=scheduleDetailEditingSection===section;
  if(section==='schedule-form'){
    const cancelAction=canCancelSchedule?`<button type="button" class="schedule-detail-action danger" onclick="openCancelScheduleModal('${scheduleId}')">取消</button>`:'';
    return renderDetailDrawerCard(title,content,{className,actionsHtml:`${cancelAction}<button type="button" class="schedule-detail-action" onclick="openScheduleModal('${scheduleId}')">编辑</button>`});
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
  return renderDetailDrawerHero({title:'新建排课',avatar:'新',subtitleHtml:`<span id="scheduleCreateSubtitle">${esc([timeText,seed.venue||''].filter(Boolean).join(' · '))}</span>`,statusText:'待保存'});
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
