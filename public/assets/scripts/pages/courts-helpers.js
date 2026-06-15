function courtDateFilterQuickOptions(){
  return ['全部','今日','本周','本月','自定义'];
}
function formatCourtDateRangeValue(start,end){
  if(!start||!end)return '全部时间';
  return `${start} 至 ${end}`;
}
