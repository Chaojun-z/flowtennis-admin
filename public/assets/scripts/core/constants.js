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
function normalizeCampusVenueStatus(value){
  const raw=String(value??'').trim();
  return raw==='inactive'||raw==='停用'?'inactive':'active';
}
function normalizeCampusVenues(venues=[]){
  if(!Array.isArray(venues))return [];
  return venues.map((venue,index)=>{
    const name=String(venue?.name||venue?.venue||venue?.label||'').trim();
    if(!name)return null;
    const id=String(venue?.id||venue?.venueId||`venue-${index+1}`).trim();
    const spaceType=String(venue?.spaceType||venue?.venueSpaceType||venue?.type||'室内').trim()||'室内';
    const sortOrder=Number.isFinite(Number(venue?.sortOrder))?Number(venue.sortOrder):index+1;
    return {id,name,spaceType,status:normalizeCampusVenueStatus(venue?.status),sortOrder};
  }).filter(Boolean).sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name,'zh-Hans-CN'));
}
function campusRowByValue(value){
  const raw=campusKey(value);
  return (Array.isArray(campuses)?campuses:[]).find(c=>[c.code,c.id,c.name].map(v=>campusKey(v)).includes(raw))||null;
}
function activeCampusVenueRows(campusValue){
  return normalizeCampusVenues(campusRowByValue(campusValue)?.venues).filter(v=>v.status!=='inactive');
}
function activeCampusVenueCount(campusRow){
  return normalizeCampusVenues(campusRow?.venues).filter(v=>v.status!=='inactive').length;
}
function campusVenueByValue(campusValue,venueValue){
  const raw=String(venueValue||'').trim();
  if(!raw)return null;
  return activeCampusVenueRows(campusValue).find(v=>String(v.id)===raw||String(v.name)===raw)||null;
}
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
const WEEKDAYS=['周一','周二','周三','周四','周五','周六','周日'];
const PAGE_SIZE=15;
const BUSINESS_TAXONOMY=(typeof FlowTennisBusinessTaxonomy==='object'&&FlowTennisBusinessTaxonomy)||{};
const SOURCES=BUSINESS_TAXONOMY.SOURCES;
const PRODUCT_TYPES=BUSINESS_TAXONOMY.PRODUCT_TYPES;
const STANDARD_COURSE_TYPE_OPTIONS=BUSINESS_TAXONOMY.STANDARD_COURSE_TYPE_OPTIONS;
const EXPERIENCE_TYPES=BUSINESS_TAXONOMY.EXPERIENCE_TYPES;
const SMALL_CLASS_TYPE_OPTIONS=BUSINESS_TAXONOMY.SMALL_CLASS_TYPE_OPTIONS;
const STUDENT_TYPE_OPTIONS=BUSINESS_TAXONOMY.STUDENT_TYPE_OPTIONS;
const PACKAGE_STATUS_OPTIONS=BUSINESS_TAXONOMY.PACKAGE_STATUS_OPTIONS;
const PACKAGE_TIME_BAND_OPTIONS=BUSINESS_TAXONOMY.PACKAGE_TIME_BAND_OPTIONS;
const LEAD_FOLLOWUP_TYPE_OPTIONS=BUSINESS_TAXONOMY.LEAD_FOLLOWUP_TYPE_OPTIONS;
const LEAD_STATUS_AFTER_OPTIONS=BUSINESS_TAXONOMY.LEAD_STATUS_AFTER_OPTIONS;
const ENTITLEMENT_STATUS_OPTIONS=BUSINESS_TAXONOMY.ENTITLEMENT_STATUS_OPTIONS;
const MEMBERSHIP_PLAN_STATUS_OPTIONS=BUSINESS_TAXONOMY.MEMBERSHIP_PLAN_STATUS_OPTIONS;
const PAY_METHODS=BUSINESS_TAXONOMY.PAY_METHODS;
const SCH_STATUSES=BUSINESS_TAXONOMY.SCHEDULE_STATUSES;
const SCH_CANCEL_REASONS=BUSINESS_TAXONOMY.SCHEDULE_CANCEL_REASONS;
const SCH_NOTIFY_STATUSES=BUSINESS_TAXONOMY.SCHEDULE_NOTIFY_STATUSES;
const SCH_CONFIRM_STATUSES=BUSINESS_TAXONOMY.SCHEDULE_CONFIRM_STATUSES;
const SCH_SOURCES=BUSINESS_TAXONOMY.SCHEDULE_SOURCES;
const CLS_STATUSES=BUSINESS_TAXONOMY.CLASS_STATUSES;
const STUDENT_STATUS_LABELS=BUSINESS_TAXONOMY.STUDENT_STATUS_LABELS;
let globalDatePickerState={targetInputId:'',targetButtonId:'',label:'',viewDate:today()};
let purchaseImportState={fileName:'',rows:[],summary:null};

function fmt(n){return(n||0).toLocaleString('zh-CN')}
function localDateKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function today(){return localDateKey(new Date())}
