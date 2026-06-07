const API='';
let CAMPUS={};
function campusDisplayName(value){
  const raw=String(value??'').trim();
  if(!raw||raw==='undefined'||raw==='null')return '';
  if(raw==='__external__'||raw==='external')return '外部场馆';
  if(raw==='mabao'||raw==='顺义马坡'||raw==='马坡')return '顺义马坡';
  return raw;
}
function campusKey(value){
  const raw=String(value??'').trim();
  if(raw==='mabao'||raw==='顺义马坡'||raw==='马坡')return 'mabao';
  return raw;
}
function sameCampusValue(a,b){
  return campusKey(a)===campusKey(b);
}
function cn(k){
  const raw=String(k??'').trim();
  if(!raw||raw==='undefined'||raw==='null')return '';
  if(CAMPUS[raw])return campusDisplayName(CAMPUS[raw]);
  const hit=campuses.find(c=>[c.code,c.id,c.name].map(v=>String(v||'').trim()).includes(raw));
  return campusDisplayName(hit?.name||raw);
}
function campusOpts(sel){return Object.entries(CAMPUS).map(([k,v])=>`<option value="${k}"${sel===k?' selected':''}>${v}</option>`).join('');}
const VENUES=['1号场','2号场','3号场','4号场'];
function venueOpts(sel){
  const extra=sel&&!VENUES.includes(sel)?[`<option value="${esc(sel)}" selected>${esc(sel)}</option>`]:[];
  return [...extra,...VENUES.map(v=>`<option value="${v}"${sel===v?' selected':''}>${v}</option>`)].join('');
}
const COACHES_LIST=['Siren','朝珺','Rive 天昊','晓哲'];
const COACH_NAME_ALIAS_MAP={
  '沙琪儿':'Siren 教练','siren':'Siren 教练','Siren':'Siren 教练',
  '朝珺':'朝珺教练','甄朝珺':'朝珺教练','chaojun':'朝珺教练',
  'Rive':'Rive 天昊教练','rive':'Rive 天昊教练','天昊':'Rive 天昊教练','Rive 天昊':'Rive 天昊教练',
  '晓哲':'晓哲教练'
};
const COACH_OPS_ORDER_STORAGE_KEY='ft_coach_ops_order';
function canonicalCoachName(v){
  const raw=String(v||'').trim();
  return COACH_NAME_ALIAS_MAP[raw]||raw;
}
function coachName(v){return canonicalCoachName(v)}
function findCoachByName(value){
  const normalized=coachName(value);
  return (Array.isArray(coaches)?coaches:[]).find(c=>coachName(c.name)===normalized)||null;
}
function coachIdValue(value){
  const row=findCoachByName(value);
  return String(row?.id||value||'').trim();
}
function coachOpsStoredOrder(){
  try{
    const raw=localStorage.getItem(COACH_OPS_ORDER_STORAGE_KEY);
    if(!raw)return [];
    const parsed=JSON.parse(raw);
    return Array.isArray(parsed)?parsed.map(v=>coachName(v)).filter(Boolean):[];
  }catch(e){return []}
}
function coachOpsStoredOrderIndex(name){
  return coachOpsStoredOrder().findIndex(item=>coachName(item)===coachName(name));
}
function saveCoachOpsStoredOrder(order){
  try{
    localStorage.setItem(COACH_OPS_ORDER_STORAGE_KEY,JSON.stringify([...new Set((Array.isArray(order)?order:[]).map(item=>coachName(item)).filter(Boolean))]));
  }catch(e){}
}
function coachSortValue(name){
  const normalized=coachName(name);
  const storedIndex=coachOpsStoredOrderIndex(normalized);
  if(storedIndex>=0)return storedIndex;
  const row=(Array.isArray(coaches)?coaches:[]).find(c=>coachName(c.name)===normalized);
  const value=Number(row?.sortOrder);
  return Number.isFinite(value)?value:9999;
}
function activeCoachNames(){
  const live=[...new Set(coaches.filter(c=>c.status==='active').sort((a,b)=>coachSortValue(a.name)-coachSortValue(b.name)||String(coachName(a.name)).localeCompare(String(coachName(b.name)),'zh-Hans-CN')).map(c=>coachName(c.name)).filter(Boolean))];
  return live.length?live:COACHES_LIST;
}
const SOURCES=['转介绍','小红书','大众点评','视频号','抖音','播客','孙老师','直接线下到电','群友','小班课转化','开业活动期间','其他'];
const WEEKDAYS=['周一','周二','周三','周四','周五','周六','周日'];
const PAGE_SIZE=15;
const PRODUCT_TYPES=['私教课','体验课','小班课','大师课','陪打'];
const STANDARD_COURSE_TYPE_OPTIONS=[{value:'私教课',label:'私教课'},{value:'体验课 / 私教体验课',label:'体验课 / 私教体验课'},{value:'体验课 / 小班体验课',label:'体验课 / 小班体验课'},{value:'小班课 / 单次',label:'小班课 / 单次'},{value:'小班课 / 训练营',label:'小班课 / 训练营'},{value:'小班课 / 随到随学',label:'小班课 / 随到随学'},{value:'大师课',label:'大师课'},{value:'陪打',label:'陪打'}];
const EXPERIENCE_TYPES=['私教体验课','小班体验课'];
const PAY_METHODS=['微信','支付宝','现金','转账','大众点评券码','抖音券码','其他'];
const SCH_STATUSES=['已排课','已结束','已取消'];
const SCH_CANCEL_REASONS=['学员请假','教练请假','天气 / 场地','临时调整','体验课未到','其他'];
const SCH_NOTIFY_STATUSES=['未通知','已通知学员','已通知教练','都已通知'];
const SCH_CONFIRM_STATUSES=['待确认','已确认'];
const SCH_SOURCES=['排课表','教练运营','班次','学员','学习计划'];
const CLS_STATUSES=['已排班','已取消','已结课'];
const STUDENT_STATUS_LABELS=['上课中','待转化','沉默30天','仅订场','无班次'];
let globalDatePickerState={targetInputId:'',targetButtonId:'',label:'',viewDate:today()};
let purchaseImportState={fileName:'',rows:[],summary:null};

function fmt(n){return(n||0).toLocaleString('zh-CN')}
function localDateKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function today(){return localDateKey(new Date())}
