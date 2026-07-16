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
