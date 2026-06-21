function scheduleStatusLabel(status){
  if(status==='已结束')return '已下课';
  if(status==='已排课')return '待上课';
  return status||'待上课';
}
function scheduleStatusTagClass(status){
  return status==='已排课'?'tms-tag-tier-blue':status==='已结束'?'tms-tag-green':status==='已取消'?'tms-tag-tier-slate':'tms-tag-tier-slate';
}
function scheduleVenueOptionsForCampus(campusCode){
  return activeCampusVenueRows(campusCode).map(v=>({value:v.id,label:v.name}));
}
function scheduleCampusAllowsCustomVenue(campusCode){
  return !activeCampusVenueRows(campusCode).length;
}
function scheduleVenueByValue(campusCode,value){
  return campusVenueByValue(campusCode,value);
}
function scheduleVenueSelectValue(campusCode,value=''){
  const rows=activeCampusVenueRows(campusCode);
  const hit=rows.find(v=>String(v.id)===String(value||'')||String(v.name)===String(value||''));
  return hit?.id||value||rows[0]?.id||'';
}
function renderScheduleVenueField(campusCode,venueValue=''){
  if(scheduleCampusAllowsCustomVenue(campusCode))return `<input class="finput tms-form-control" id="sch_venue" value="${esc(venueValue||'')}" placeholder="请直接填写场地">`;
  const venueOptions=scheduleVenueOptionsForCampus(campusCode);
  const nextValue=scheduleVenueSelectValue(campusCode,venueValue);
  return renderStandardDropdownHtml('sch_venue','场地',venueOptions,nextValue,true);
}
function syncScheduleVenueField(preserveValue=''){
  const host=document.getElementById('sch_venueFieldHost');
  if(!host)return;
  const currentValue=preserveValue||document.getElementById('sch_venue')?.value||'';
  const campusValue=document.getElementById('sch_campus')?.value||'';
  host.innerHTML=renderScheduleVenueField(campusValue,currentValue);
}
