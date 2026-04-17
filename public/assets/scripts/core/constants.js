const API='';
let CAMPUS={};
function cn(k){
  const raw=String(k??'').trim();
  if(!raw||raw==='undefined'||raw==='null')return '';
  if(CAMPUS[raw])return CAMPUS[raw];
  const hit=campuses.find(c=>[c.code,c.id,c.name].map(v=>String(v||'').trim()).includes(raw));
  return hit?.name||raw;
}
function campusOpts(sel){return Object.entries(CAMPUS).map(([k,v])=>`<option value="${k}"${sel===k?' selected':''}>${v}</option>`).join('');}
const VENUES=['1号场','2号场','3号场','4号场'];
function venueOpts(sel){
  const extra=sel&&!VENUES.includes(sel)?[`<option value="${esc(sel)}" selected>${esc(sel)}</option>`]:[];
  return [...extra,...VENUES.map(v=>`<option value="${v}"${sel===v?' selected':''}>${v}</option>`)].join('');
}
const COACHES_LIST=['朝珺','晓哲','Siren','吴教练','Rive','郭教练','代教练','Jack','李韬','孙老师','Zoe','刘朝'];
function coachName(v){return String(v||'').trim()}
function activeCoachNames(){const live=[...new Set(coaches.filter(c=>c.status==='active').map(c=>coachName(c.name)).filter(Boolean))];return live.length?live:COACHES_LIST;}
const SOURCES=['大众点评','抖音','视频号','小红书','转介绍','孙老师','播客','其他'];
const WEEKDAYS=['周一','周二','周三','周四','周五','周六','周日'];
const PAGE_SIZE=15;
const PRODUCT_TYPES=['私教课','体验课','训练营','大师课'];
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
