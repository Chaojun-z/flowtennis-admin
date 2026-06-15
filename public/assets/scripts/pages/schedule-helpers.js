function scheduleStatusLabel(status){
  if(status==='已结束')return '已下课';
  if(status==='已排课')return '待上课';
  return status||'待上课';
}
function scheduleStatusTagClass(status){
  return status==='已排课'?'tms-tag-tier-blue':status==='已结束'?'tms-tag-green':status==='已取消'?'tms-tag-tier-slate':'tms-tag-tier-slate';
}
