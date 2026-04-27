const TableStore = require('tablestore');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const mabaoFinanceSeed = require('./seeds/mabao-finance-seed.json');

const JWT_SECRET = process.env.JWT_SECRET;
const TS_ENDPOINT = process.env.TS_ENDPOINT;
const TS_INSTANCE = process.env.TS_INSTANCE || 'flowtennis';
const TS_KEY_ID = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID;
const TS_KEY_SEC = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;
const REQUIRED_ENV_VARS = ['JWT_SECRET', 'TS_ENDPOINT', 'ALIBABA_CLOUD_ACCESS_KEY_ID', 'ALIBABA_CLOUD_ACCESS_KEY_SECRET'];
const ENABLE_DEFAULT_USER_BOOTSTRAP = process.env.ENABLE_DEFAULT_USER_BOOTSTRAP === 'true';
const ENABLE_TABLE_BOOTSTRAP = process.env.ENABLE_TABLE_BOOTSTRAP === 'true';
const ENABLE_RUNTIME_TABLE_ENSURE = process.env.ENABLE_RUNTIME_TABLE_ENSURE === 'true';
const ENABLE_DEFAULT_PRICE_PLAN_BOOTSTRAP = process.env.ENABLE_DEFAULT_PRICE_PLAN_BOOTSTRAP === 'true';
const ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP = process.env.ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP === 'true';
const WECHAT_MINIPROGRAM_APPID = process.env.WECHAT_MINIPROGRAM_APPID || 'wx7acb7603ee803923';
const WECHAT_MINIPROGRAM_SECRET = process.env.WECHAT_MINIPROGRAM_SECRET;
const MATCH_MINIPROGRAM_APPID = process.env.MATCH_MINIPROGRAM_APPID || '';
const MATCH_MINIPROGRAM_SECRET = process.env.MATCH_MINIPROGRAM_SECRET || '';
const WECHAT_SCHEDULE_TEMPLATE_ID = process.env.WECHAT_SCHEDULE_TEMPLATE_ID;
const WECHAT_COURSE_REMINDER_TEMPLATE_ID = process.env.WECHAT_COURSE_REMINDER_TEMPLATE_ID;
const MATCH_WECHAT_TEMPLATE_ID = process.env.MATCH_WECHAT_TEMPLATE_ID;
const MATCH_DATABASE_URL = process.env.MATCH_DATABASE_URL || process.env.DATABASE_URL;
const DEFAULT_ADMIN_BOOTSTRAP_PASSWORD = process.env.DEFAULT_ADMIN_BOOTSTRAP_PASSWORD || '';
const MATCH_CREATOR_CONFIRM_DEADLINE_HOURS = 12;
const MATCH_PREPAY_WINDOW_HOURS = 2;

const T_USERS='ft_users',T_COURTS='ft_courts',T_STUDENTS='ft_students',T_PRODUCTS='ft_products',T_PLANS='ft_plans',T_SCHEDULE='ft_schedule',T_COACHES='ft_coaches',T_CLASSES='ft_classes',T_CLASS_NOS='ft_class_nos',T_CAMPUSES='ft_campuses',T_FEEDBACKS='ft_feedbacks',T_PACKAGES='ft_packages',T_PURCHASES='ft_purchases',T_ENTITLEMENTS='ft_entitlements',T_ENTITLEMENT_LEDGER='ft_entitlement_ledger',T_FINANCIAL_LEDGER='ft_financial_ledger',T_MEMBERSHIP_PLANS='ft_membership_plans',T_MEMBERSHIP_ACCOUNTS='ft_membership_accounts',T_MEMBERSHIP_ORDERS='ft_membership_orders',T_MEMBERSHIP_BENEFIT_LEDGER='ft_membership_benefit_ledger',T_MEMBERSHIP_ACCOUNT_EVENTS='ft_membership_account_events',T_PRICE_PLANS='ft_price_plans';
const MATCH_COURT_FINANCE_ACCOUNT_ID='match-court-finance';
const MATCH_SQL_TABLES=['match_users','match_posts','match_registrations','match_attendance','match_bookings','match_fee_records','match_fee_splits','match_operation_logs','match_replacements'];
const MEMBERSHIP_TABLES=[T_MEMBERSHIP_PLANS,T_MEMBERSHIP_ACCOUNTS,T_MEMBERSHIP_ORDERS,T_MEMBERSHIP_BENEFIT_LEDGER,T_MEMBERSHIP_ACCOUNT_EVENTS];
const RUNTIME_ENSURED_TABLES=[T_FEEDBACKS,T_PACKAGES,T_PURCHASES,T_ENTITLEMENTS,T_ENTITLEMENT_LEDGER,T_CLASS_NOS,T_PRICE_PLANS,...MEMBERSHIP_TABLES];
const TEST_DATA_RESET_TABLES=[
  T_COURTS,
  T_STUDENTS,
  T_PRODUCTS,
  T_PLANS,
  T_SCHEDULE,
  T_CLASSES,
  T_CLASS_NOS,
  T_FEEDBACKS,
  T_PACKAGES,
  T_PURCHASES,
  T_ENTITLEMENTS,
  T_ENTITLEMENT_LEDGER,
  T_PRICE_PLANS,
  ...MEMBERSHIP_TABLES
];
const HOT_SCAN_TABLES=new Map([
  [T_USERS,{ttlMs:60000}],
  [T_COURTS,{ttlMs:60000}],
  [T_STUDENTS,{ttlMs:60000}],
  [T_PRODUCTS,{ttlMs:60000}],
  [T_SCHEDULE,{ttlMs:60000}],
  [T_CLASSES,{ttlMs:60000}],
  [T_PLANS,{ttlMs:60000}],
  [T_FEEDBACKS,{ttlMs:60000}],
  [T_PACKAGES,{ttlMs:60000}],
  [T_PURCHASES,{ttlMs:60000}],
  [T_ENTITLEMENTS,{ttlMs:60000}],
  [T_ENTITLEMENT_LEDGER,{ttlMs:60000}],
  [T_MEMBERSHIP_PLANS,{ttlMs:60000}],
  [T_MEMBERSHIP_ACCOUNTS,{ttlMs:60000}],
  [T_MEMBERSHIP_ORDERS,{ttlMs:60000}],
  [T_MEMBERSHIP_BENEFIT_LEDGER,{ttlMs:60000}],
  [T_MEMBERSHIP_ACCOUNT_EVENTS,{ttlMs:60000}],
  [T_COACHES,{ttlMs:60000}],
  [T_CAMPUSES,{ttlMs:60000}],
  [T_PRICE_PLANS,{ttlMs:60000}]
]);
const HOT_GET_TABLES=new Map([
  [T_USERS,{ttlMs:60000}],
  [T_CLASSES,{ttlMs:60000}],
  [T_ENTITLEMENTS,{ttlMs:60000}],
  [T_COURTS,{ttlMs:60000}],
  [T_MEMBERSHIP_PLANS,{ttlMs:60000}],
  [T_MEMBERSHIP_ACCOUNTS,{ttlMs:60000}],
  [T_MEMBERSHIP_ORDERS,{ttlMs:60000}],
  [T_PRICE_PLANS,{ttlMs:60000}]
]);
const hotScanCache=new Map();
const hotGetCache=new Map();
let importedLedgerRepairChecked=false;

let tsClient;
const wechatAccessTokenCacheByApp = new Map();
let matchSqlPool;
function gc(){if(!tsClient)tsClient=new TableStore.Client({accessKeyId:TS_KEY_ID,secretAccessKey:TS_KEY_SEC,endpoint:TS_ENDPOINT,instancename:TS_INSTANCE,maxRetries:3});return tsClient;}
function getMatchSqlPool(){
  if(!MATCH_DATABASE_URL)throw new Error('缺少 MATCH_DATABASE_URL 或 DATABASE_URL，约球真实数据不能使用 mock 或 TableStore');
  if(!matchSqlPool)matchSqlPool=new Pool({connectionString:MATCH_DATABASE_URL,ssl:process.env.MATCH_DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
  return matchSqlPool;
}
function isTransientStorageError(err){
  const msg=String(err?.message||err||'');
  return /Client network socket disconnected before secure TLS connection was established|ECONNRESET|ETIMEDOUT|socket hang up|EAI_AGAIN/i.test(msg);
}
async function withStorageRetry(fn,maxAttempts=2){
  let lastErr;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    try{return await fn();}
    catch(err){
      lastErr=err;
      if(!isTransientStorageError(err)||attempt===maxAttempts)throw err;
      await new Promise(res=>setTimeout(res,attempt*200));
    }
  }
  throw lastErr;
}
function cloneCacheValue(value){return JSON.parse(JSON.stringify(value));}
function invalidateHotScanCache(t){hotScanCache.delete(t);}
function hotGetCacheKey(t,id){return `${t}:${String(id)}`;}
function invalidateHotGetCache(t,id){
  if(id===undefined||id===null){
    for(const key of hotGetCache.keys())if(key.startsWith(`${t}:`))hotGetCache.delete(key);
    return;
  }
  hotGetCache.delete(hotGetCacheKey(t,id));
}
async function getCachedScan(t){
  const cfg=HOT_SCAN_TABLES.get(t);
  if(!cfg)return scan(t);
  const now=Date.now();
  const cached=hotScanCache.get(t);
  if(cached&&cached.expiresAt>now)return cloneCacheValue(cached.rows);
  const rows=await scan(t);
  hotScanCache.set(t,{rows:cloneCacheValue(rows),expiresAt:now+cfg.ttlMs});
  return rows;
}
async function getCachedRow(t,id){
  const cfg=HOT_GET_TABLES.get(t);
  if(!cfg)return get(t,id);
  const now=Date.now();
  const key=hotGetCacheKey(t,id);
  const cached=hotGetCache.get(key);
  if(cached&&cached.expiresAt>now)return cloneCacheValue(cached.row);
  const row=await get(t,id);
  hotGetCache.set(key,{row:cloneCacheValue(row),expiresAt:now+cfg.ttlMs});
  return row;
}
function put(t,id,attrs){if(HOT_SCAN_TABLES.has(t))invalidateHotScanCache(t);if(HOT_GET_TABLES.has(t))invalidateHotGetCache(t,id);return withStorageRetry(()=>new Promise((res,rej)=>{gc().putRow({tableName:t,condition:new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE,null),primaryKey:[{id:String(id)}],attributeColumns:Object.entries(attrs).filter(([k])=>k!=='id').map(([k,v])=>({[k]:typeof v==='object'?JSON.stringify(v):String(v??'')}))},( e,d)=>e?rej(e):res(d));}));}
function putIfAbsent(t,id,attrs){return withStorageRetry(()=>new Promise((res,rej)=>{gc().putRow({tableName:t,condition:new TableStore.Condition(TableStore.RowExistenceExpectation.EXPECT_NOT_EXIST,null),primaryKey:[{id:String(id)}],attributeColumns:Object.entries(attrs).filter(([k])=>k!=='id').map(([k,v])=>({[k]:typeof v==='object'?JSON.stringify(v):String(v??'')}))},( e,d)=>e?rej(e):res(d));}));}
function get(t,id){return withStorageRetry(()=>new Promise((res,rej)=>{gc().getRow({tableName:t,primaryKey:[{id:String(id)}],maxVersions:1},(e,d)=>{if(e)return rej(e);if(!d.row||!d.row.primaryKey)return res(null);const obj={id:d.row.primaryKey[0].value};(d.row.attributes||[]).forEach(a=>{try{obj[a.columnName]=JSON.parse(a.columnValue);}catch{obj[a.columnName]=a.columnValue;}});res(obj);});}));}
function scan(t){return withStorageRetry(()=>new Promise((res,rej)=>{const rows=[];function f(sk){gc().getRange({tableName:t,direction:TableStore.Direction.FORWARD,inclusiveStartPrimaryKey:sk||[{id:TableStore.INF_MIN}],exclusiveEndPrimaryKey:[{id:TableStore.INF_MAX}],maxVersions:1,limit:500},(e,d)=>{if(e)return rej(e);(d.rows||[]).forEach(r=>{if(!r.primaryKey)return;const obj={id:r.primaryKey[0].value};(r.attributes||[]).forEach(a=>{try{obj[a.columnName]=JSON.parse(a.columnValue);}catch{obj[a.columnName]=a.columnValue;}});rows.push(obj);});d.nextStartPrimaryKey?f(d.nextStartPrimaryKey):res(rows);});}f();}));}
function del(t,id){if(HOT_SCAN_TABLES.has(t))invalidateHotScanCache(t);if(HOT_GET_TABLES.has(t))invalidateHotGetCache(t,id);return withStorageRetry(()=>new Promise((res,rej)=>{gc().deleteRow({tableName:t,condition:new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE,null),primaryKey:[{id:String(id)}]},(e,d)=>e?rej(e):res(d));}));}
async function clearTables(storage,tables){
  const result={success:true,total:0,tables:[]};
  for(const table of tables){
    try{
      const rows=await storage.scan(table);
      for(const row of rows)await storage.del(table,row.id);
      result.total+=rows.length;
      result.tables.push({table,count:rows.length});
    }catch(err){
      result.success=false;
      result.tables.push({table,count:0,error:String(err?.message||err)});
    }
  }
  return result;
}
function getTestDataResetTables(){return [...TEST_DATA_RESET_TABLES];}
function mkTable(t){return new Promise(res=>{gc().createTable({tableMeta:{tableName:t,primaryKey:[{name:'id',type:TableStore.PrimaryKeyType.STRING}]},reservedThroughput:{capacityUnit:{read:0,write:0}},tableOptions:{timeToLive:-1,maxVersions:1}},e=>res(e?'exists':'ok'));});}
async function timed(label,fn){const startedAt=Date.now();try{return await fn();}finally{console.log(`[api-timing] ${label} ${Date.now()-startedAt}ms`);}}
function withTimeout(promise,ms,fallback){
  return Promise.race([promise,new Promise((res)=>setTimeout(()=>res(fallback),ms))]);
}
function isTableMissingError(err){return /not.*exist|table.*not.*exist|OTSObjectNotExist/i.test(String(err?.message||err||''));}
async function putFeedback(id,row){
  try{return await put(T_FEEDBACKS,id,row);}
  catch(err){
    if(!isTableMissingError(err))throw err;
    await mkTable(T_FEEDBACKS);
    return put(T_FEEDBACKS,id,row);
  }
}
async function scanFeedbacks(){
  try{return await scan(T_FEEDBACKS);}
  catch(err){
    if(!isTableMissingError(err))throw err;
    return [];
  }
}
async function prewarmHotScanCache(){
  await Promise.all([...HOT_SCAN_TABLES.keys()].map(t=>getCachedScan(t)));
}
function getRuntimeEnsuredTables(){return [...RUNTIME_ENSURED_TABLES];}
function parseArr(v){if(Array.isArray(v))return v;if(typeof v==='string'&&v){try{return JSON.parse(v)}catch{return[]}}return[];}
function parseLessonValue(v,fallback=0){
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}
function isBillableSchedule(rec){return rec&&rec.status!=='已取消';}
function isScheduleLessonCharged(rec){return isBillableSchedule(rec)&&!rec.coachLateFree;}
async function applyLessonDelta(classId,delta,studentIds=[]){
  if(!classId||!delta)return null;
  const cls=await getCachedRow(T_CLASSES,classId);
  if(!cls)return null;
  const oldClass={...cls};
  const nextUsed=Math.max(0,parseLessonValue(cls.usedLessons)+delta);
  const relatedPlans=(await timed('scan plans for lesson delta',()=>getCachedScan(T_PLANS))).filter((p)=>p.classId===classId&&p.status==='active');
  const studentSet=new Set(parseArr(studentIds).filter(Boolean));
  const chargedPlans=studentSet.size?relatedPlans.filter(p=>studentSet.has(p.studentId)):relatedPlans;
  const oldPlans=relatedPlans.map((p)=>({...p}));
  const updatedPlans=[];
  try{
    const nextClass={...cls,usedLessons:nextUsed,updatedAt:new Date().toISOString()};
    await put(T_CLASSES,classId,nextClass);
    for(const p of chargedPlans){
      const nextPlanUsed=Math.max(0,parseLessonValue(p.usedLessons)+delta);
      const nextPlan={...p,usedLessons:nextPlanUsed,updatedAt:new Date().toISOString()};
      await put(T_PLANS,p.id,nextPlan);
      updatedPlans.push(nextPlan);
    }
    return {class:nextClass,plans:updatedPlans};
  }catch(err){
    await put(T_CLASSES,classId,oldClass).catch(()=>null);
    for(const p of oldPlans)await put(T_PLANS,p.id,p).catch(()=>null);
    throw err;
  }
}
function scheduleLessonDelta(rec){
  if(!rec||!rec.classId||!isScheduleLessonCharged(rec))return null;
  const lessonCount=parseLessonValue(rec.lessonCount);
  if(lessonCount<=0)return null;
  return {classId:rec.classId,delta:lessonCount};
}
function effectiveScheduleStatus(rec,now=new Date()){
  if(!rec)return '';
  const status=rec.status||'已排课';
  if(status==='已下课')return '已结束';
  if(status==='已取消'||status==='已结束')return status;
  const end=dateMs(rec.endTime);
  const nowMs=now instanceof Date?now.getTime():dateMs(now);
  if(status==='已排课'&&Number.isFinite(end)&&Number.isFinite(nowMs)&&end<nowMs)return '已结束';
  return status;
}
function scheduleLessonChargeStatus(rec,ledger=[]){
  if(!rec||effectiveScheduleStatus(rec)==='已取消')return '不扣课';
  if(rec.coachLateFree)return '迟到免费';
  if(parseLessonValue(rec.lessonCount)<=0)return '不扣课';
  if(!rec.entitlementId)return '未扣课';
  const used=(ledger||[]).some(l=>l.scheduleId===rec.id&&l.entitlementId===rec.entitlementId&&parseLessonValue(l.lessonDelta)<0);
  return used?'已扣课':'扣课异常';
}
function assertCanWriteSchedule(user){
  if(user?.role==='admin')return;
  throw new Error('无权限');
}
function scheduleHasFeedbackRecord(schedule,feedbacks=[]){
  const scheduleId=String(schedule?.id||'').trim();
  if(!scheduleId)return false;
  return (feedbacks||[]).some(item=>String(item?.scheduleId||'').trim()===scheduleId);
}
function scheduleIsTrialLesson(schedule){
  if(schedule?.isTrial===true)return true;
  return /体验/.test(String(schedule?.courseType||''));
}
function workbenchTrialConvertedByPurchaseRecord(schedule,purchases=[]){
  const studentIds=parseArr(schedule?.studentIds).filter(Boolean);
  const studentId=studentIds[0]||String(schedule?.studentId||'').trim();
  const studentName=String(schedule?.studentName||'').trim();
  const trialDate=dateKey(schedule?.endTime||schedule?.startTime);
  if(!trialDate)return false;
  return (purchases||[]).some(item=>{
    if(String(item?.status||'').trim()==='voided')return false;
    const purchaseDate=dateKey(item?.purchaseDate||item?.createdAt);
    if(!purchaseDate||purchaseDate<trialDate)return false;
    if(studentId)return String(item?.studentId||'').trim()===studentId;
    return !!studentName&&String(item?.studentName||'').trim()===studentName;
  });
}
function resolveWorkbenchState(schedule,prevSchedule,now=new Date(),feedbacks=[]){
  const fromBackend=schedule?.workbenchState;
  if(fromBackend&&typeof fromBackend==='object'&&fromBackend.code&&fromBackend.label){
    return {code:fromBackend.code,label:fromBackend.label};
  }
  if(!schedule||effectiveScheduleStatus(schedule,now)==='已取消')return null;
  const startMs=dateMs(schedule.startTime);
  const endMs=dateMs(schedule.endTime||schedule.startTime);
  const nowMs=now instanceof Date?now.getTime():dateMs(now);
  const startDiff=Number.isFinite(startMs)&&Number.isFinite(nowMs)?Math.round((startMs-nowMs)/60000):null;
  const sameDay=prevSchedule&&dateKey(prevSchedule.startTime)===dateKey(schedule.startTime);
  const travelGap=sameDay&&prevSchedule&&prevSchedule.campus!==schedule.campus&&prevSchedule.endTime
    ? Math.round((dateMs(schedule.startTime)-dateMs(prevSchedule.endTime))/60000)
    : null;
  const ended=effectiveScheduleStatus(schedule,now)==='已结束';
  if(Number.isFinite(startMs)&&Number.isFinite(endMs)&&startMs<=nowMs&&nowMs<endMs){
    return {code:'live',label:'进行中'};
  }
  if(Number.isFinite(startDiff)&&startDiff>=0&&startDiff<=30){
    return {code:'upcoming',label:'即将开始'};
  }
  if(Number.isFinite(startDiff)&&startDiff>30&&Number.isFinite(travelGap)&&travelGap>=0&&travelGap<60){
    return {code:'travel',label:'需换场'};
  }
  if(Number.isFinite(startDiff)&&startDiff>30){
    return {code:'later',label:'今日后续'};
  }
  if(ended&&!scheduleHasFeedbackRecord(schedule,feedbacks)){
    return {code:'pending',label:'待反馈'};
  }
  return null;
}
function buildWorkbenchStats(input={}){
  if(
    Object.prototype.hasOwnProperty.call(input,'monthFinishedLessonUnits')
    ||Object.prototype.hasOwnProperty.call(input,'weekFinishedLessonUnits')
    ||Object.prototype.hasOwnProperty.call(input,'todayFinishedLessonUnits')
    ||Object.prototype.hasOwnProperty.call(input,'monthFeedbackCount')
    ||Object.prototype.hasOwnProperty.call(input,'pendingFeedbackCount')
    ||Object.prototype.hasOwnProperty.call(input,'monthTrialLessonCount')
    ||Object.prototype.hasOwnProperty.call(input,'trialConversionRate')
  ){
    return {
      monthFinishedLessonUnits:parseLessonValue(input.monthFinishedLessonUnits),
      weekFinishedLessonUnits:parseLessonValue(input.weekFinishedLessonUnits),
      todayFinishedLessonUnits:parseLessonValue(input.todayFinishedLessonUnits),
      monthFeedbackCount:parseInt(input.monthFeedbackCount,10)||0,
      pendingFeedbackCount:parseInt(input.pendingFeedbackCount,10)||0,
      monthTrialLessonCount:parseInt(input.monthTrialLessonCount,10)||0,
      trialConversionRate:parseLessonValue(input.trialConversionRate)
    };
  }
  const now=input.now instanceof Date?input.now:new Date();
  const scheduleRows=Array.isArray(input.schedule)?input.schedule:[];
  const feedbacks=Array.isArray(input.feedbacks)?input.feedbacks:[];
  const purchases=Array.isArray(input.purchases)?input.purchases:[];
  const monthKey=dateKey(now.toISOString()).slice(0,7);
  const dayKey=dateKey(now.toISOString());
  const weekStart=new Date(now);
  weekStart.setHours(0,0,0,0);
  const day=weekStart.getDay()||7;
  weekStart.setDate(weekStart.getDate()-day+1);
  const weekStartKey=dateKey(weekStart.toISOString());
  const weekEnd=new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate()+6);
  const weekEndKey=dateKey(weekEnd.toISOString());
  const endedRows=scheduleRows.filter(item=>effectiveScheduleStatus(item,now)==='已结束');
  const monthEndedRows=endedRows.filter(item=>dateKey(item.startTime).slice(0,7)===monthKey);
  const weekEndedRows=endedRows.filter(item=>{const key=dateKey(item.startTime);return key>=weekStartKey&&key<=weekEndKey;});
  const todayEndedRows=endedRows.filter(item=>dateKey(item.startTime)===dayKey);
  const monthTrialRows=monthEndedRows.filter(scheduleIsTrialLesson);
  const monthTrialConverted=monthTrialRows.filter(item=>workbenchTrialConvertedByPurchaseRecord(item,purchases)).length;
  return {
    monthFinishedLessonUnits:monthEndedRows.reduce((sum,item)=>sum+parseLessonValue(item.lessonCount,1),0),
    weekFinishedLessonUnits:weekEndedRows.reduce((sum,item)=>sum+parseLessonValue(item.lessonCount,1),0),
    todayFinishedLessonUnits:todayEndedRows.reduce((sum,item)=>sum+parseLessonValue(item.lessonCount,1),0),
    monthFeedbackCount:monthEndedRows.filter(item=>scheduleHasFeedbackRecord(item,feedbacks)).length,
    pendingFeedbackCount:endedRows.filter(item=>!scheduleHasFeedbackRecord(item,feedbacks)).length,
    monthTrialLessonCount:monthTrialRows.length,
    trialConversionRate:monthTrialRows.length?Math.round(monthTrialConverted/monthTrialRows.length*100):0
  };
}
function decorateWorkbenchScheduleRows(schedule=[],feedbacks=[],purchases=[],now=new Date()){
  const sorted=(Array.isArray(schedule)?schedule:[]).slice().sort((a,b)=>{
    const coachCompare=String(a?.coach||'').localeCompare(String(b?.coach||''),'zh-CN');
    if(coachCompare!==0)return coachCompare;
    return String(a?.startTime||'').localeCompare(String(b?.startTime||''));
  });
  let prevByCoachDay=new Map();
  return sorted.map(item=>{
    const coachKey=String(item?.coach||'').trim();
    const dayKeyValue=dateKey(item?.startTime);
    const prevKey=`${coachKey}__${dayKeyValue}`;
    const prevSchedule=prevByCoachDay.get(prevKey)||null;
    const workbenchState=resolveWorkbenchState(item,prevSchedule,now,feedbacks);
    prevByCoachDay.set(prevKey,item);
    return {
      ...item,
      workbenchState:workbenchState
    };
  });
}
function assertClassSchedulable(cls,rec){
  if(!rec?.classId||!isBillableSchedule(rec))return;
  if(!cls)throw new Error('关联班次不存在');
  if(cls.status==='已取消')throw new Error('该班次已取消，不能继续排课');
  if(cls.status==='已结课')throw new Error('该班次已结课，不能继续排课');
}
function dateMs(v){if(!v)return NaN;return new Date(String(v).replace(' ','T')).getTime();}
function dateKey(v){return String(v||'').slice(0,10);}
function clockMin(v){const m=String(v||'').slice(0,5).match(/^(\d{1,2}):(\d{2})$/);return m?(parseInt(m[1])*60+parseInt(m[2])):NaN;}
function addDaysKey(ds,days){
  const d=new Date(`${ds}T00:00:00`);
  d.setDate(d.getDate()+(parseInt(days)||0));
  return d.toISOString().slice(0,10);
}
function dayOfWeek1to7(ds){
  const d=new Date(`${ds}T00:00:00`);
  const n=d.getDay();
  return n===0?7:n;
}
function normalizeVenue(v){
  const raw=String(v||'').trim();
  const m=raw.match(/([1-4])\s*号场/);
  return m?`${m[1]}号场`:raw;
}
function rangesOverlap(aStart,aEnd,bStart,bEnd){
  const as=dateMs(aStart),ae=dateMs(aEnd),bs=dateMs(bStart),be=dateMs(bEnd);
  if(!Number.isFinite(as)||!Number.isFinite(ae)||!Number.isFinite(bs)||!Number.isFinite(be))return false;
  return as<be&&bs<ae;
}
function minutesBetween(a,b){
  const am=dateMs(a),bm=dateMs(b);
  if(!Number.isFinite(am)||!Number.isFinite(bm))return null;
  return Math.round(Math.abs(bm-am)/60000);
}
function shareStudent(a,b){
  const aIds=parseArr(a.studentIds).filter(Boolean);
  const bIds=parseArr(b.studentIds).filter(Boolean);
  if(aIds.length&&bIds.length)return aIds.some(id=>bIds.includes(id));
  const an=String(a.studentName||'').trim();
  const bn=String(b.studentName||'').trim();
  return !!(an&&bn&&an===bn);
}
function assertLessonCapacity(cls,oldDelta,nextDelta){
  if(!nextDelta)return;
  if(!cls)throw new Error('关联班次不存在');
  const total=parseLessonValue(cls.totalLessons);
  const used=parseLessonValue(cls.usedLessons);
  const oldSame=oldDelta&&oldDelta.classId===nextDelta.classId?parseLessonValue(oldDelta.delta):0;
  const nextUsed=used-oldSame+parseLessonValue(nextDelta.delta);
  if(total>0&&nextUsed>total)throw new Error(`剩余课时不足：剩余 ${Math.max(0,total-used+oldSame)} 节，本次消课 ${nextDelta.delta} 节`);
}
function validateScheduleConflicts(candidate,schedules,excludeId){
  if(!isBillableSchedule(candidate))return;
  if(!candidate.startTime)throw new Error('请选择上课时间');
  if(!candidate.endTime)throw new Error('请选择下课时间，系统需要用它校验冲突');
  if(String(candidate.startTime).slice(0,10)!==String(candidate.endTime).slice(0,10))throw new Error('上课时间不能跨天');
  if(dateMs(candidate.endTime)<=dateMs(candidate.startTime))throw new Error('下课时间不能早于上课时间');
  for(const rec of schedules||[]){
    if(!rec||rec.id===(excludeId||candidate.id)||!isBillableSchedule(rec))continue;
    if(!rangesOverlap(candidate.startTime,candidate.endTime,rec.startTime,rec.endTime))continue;
    if(candidate.coach&&rec.coach&&candidate.coach===rec.coach)throw new Error(`教练「${candidate.coach}」此时间已有课程`);
    const candidateVenue=normalizeVenue(candidate.venue);
    const recVenue=normalizeVenue(rec.venue);
    if(candidateVenue&&recVenue&&candidateVenue===recVenue&&(candidate.campus||'')===(rec.campus||''))throw new Error(`场地「${candidateVenue}」此时间已被占用`);
    if(shareStudent(candidate,rec))throw new Error('学员此时间已有课程');
  }
}
function courtBookingRange(court,row){
  if(row?.type&&row.type!=='消费')return null;
  if(row?.category&&row.category!=='订场')return null;
  if(!row?.date||!row?.startTime||!row?.endTime)return null;
  const campus=row.campus||court?.campus||'';
  const venue=normalizeVenue(row.venue||'');
  if(!campus||!venue)return null;
  const startClock=String(row.startTime).includes(' ')?String(row.startTime).slice(11,16):String(row.startTime).slice(0,5);
  const endClock=String(row.endTime).includes(' ')?String(row.endTime).slice(11,16):String(row.endTime).slice(0,5);
  return {
    courtName:court?.name||'订场用户',
    campus,
    venue,
    startTime:`${row.date} ${startClock}`,
    endTime:`${row.date} ${endClock}`
  };
}
function validateCourtBookingConflicts(candidate,courts){
  if(candidate?.scheduleSource==='订场陪打')return;
  if(!isBillableSchedule(candidate)||!candidate.startTime||!candidate.endTime||!candidate.campus||!candidate.venue)return;
  const candidateVenue=normalizeVenue(candidate.venue);
  for(const court of courts||[]){
    for(const row of normalizeCourtHistory(court.history)){
      const booking=courtBookingRange(court,row);
      if(!booking)continue;
      if(booking.campus!==candidate.campus||booking.venue!==candidateVenue)continue;
      if(rangesOverlap(candidate.startTime,candidate.endTime,booking.startTime,booking.endTime)){
        throw new Error(`场地「${candidateVenue}」${booking.startTime.slice(11,16)}-${booking.endTime.slice(11,16)} 已被订场用户「${booking.courtName}」订场`);
      }
    }
  }
}
function normalizeCourtBookingHistoryRows(court,history){
  return (history||[]).map(row=>{
    if(row?.type==='消费'&&row?.category==='订场'&&!row.campus){
      return {...row,campus:court?.campus||''};
    }
    return row;
  });
}
function assertCourtBookingHistoryAgainstSchedules(court,schedules){
  for(const row of normalizeCourtHistory(court?.history)){
    if(row?.type!=='消费'||row?.category!=='订场')continue;
    const booking=courtBookingRange(court,row);
    if(!booking)continue;
    validateScheduleConflicts(
      {
        id:row.id||court?.id||'court-booking',
        startTime:booking.startTime,
        endTime:booking.endTime,
        campus:booking.campus,
        venue:booking.venue,
        status:'已排课'
      },
      schedules,
      row.id
    );
  }
}
function buildEntitlementFromPurchase(pkg,purchase,student,id=uuidv4(),now=new Date().toISOString()){
  const purchaseDate=purchase.purchaseDate||now.slice(0,10);
  const validUntil=pkg.usageEndDate||pkg.validUntil||(pkg.validDays?addDaysKey(purchaseDate,pkg.validDays):'');
  const totalLessons=parseInt(pkg.lessons)||parseInt(pkg.totalLessons)||0;
  return {
    id,
    studentId:purchase.studentId||student?.id||'',
    studentName:purchase.studentName||student?.name||purchase.studentId||'',
    purchaseId:purchase.id||'',
    packageId:pkg.id||purchase.packageId||'',
    packageName:pkg.name||purchase.packageName||'',
    productId:pkg.productId||'',
    productName:pkg.productName||'',
    courseType:pkg.courseType||pkg.type||'',
    totalLessons,
    usedLessons:0,
    remainingLessons:totalLessons,
    validFrom:purchaseDate,
    validUntil,
    usageStartDate:pkg.usageStartDate||purchaseDate,
    usageEndDate:pkg.usageEndDate||validUntil,
    dailyTimeWindows:parseArr(pkg.dailyTimeWindows),
    timeBand:pkg.timeBand||'',
    coachIds:parseArr(pkg.coachIds),
    coachNames:parseArr(pkg.coachNames),
    ownerCoach:purchase.ownerCoach||'',
    allowedCoaches:parseArr(purchase.allowedCoaches),
    campusIds:parseArr(pkg.campusIds),
    maxStudents:parseInt(pkg.maxStudents)||0,
    status:'active',
    createdAt:now,
    updatedAt:now
  };
}
function buildPurchaseRecord(pkg,body,student,opts={}){
  const now=opts.now||new Date().toISOString();
  const purchaseDate=body.purchaseDate||now.slice(0,10);
  const systemAmount=normalizeMoney(pkg.price);
  const finalAmount=normalizeMoney(body.amountPaid??pkg.price);
  const priceOverridden=systemAmount!==finalAmount;
  const overrideReason=String(body.overrideReason||'').trim();
  if(priceOverridden&&!overrideReason)throw new Error('请填写改价原因');
  return {
    ...body,
    id:opts.id||body.id||uuidv4(),
    studentId:student.id,
    studentName:student.name||student.id,
    studentPhone:student.phone||'',
    packageId:pkg.id,
    packageName:pkg.name||'',
    productId:pkg.productId||'',
    productName:pkg.productName||'',
    courseType:pkg.courseType||pkg.type||'',
    packageLessons:parseInt(pkg.lessons)||0,
    packagePrice:normalizeMoney(pkg.price),
    priceSource:'package',
    priceSourceId:pkg.id,
    priceSourceName:pkg.name||'',
    systemAmount,
    finalAmount,
    priceOverridden,
    overrideReason,
    packageTimeBand:pkg.timeBand||'',
    dailyTimeWindows:parseArr(pkg.dailyTimeWindows),
    coachIds:parseArr(pkg.coachIds),
    coachNames:parseArr(pkg.coachNames),
    ownerCoach:body.ownerCoach||'',
    allowedCoaches:parseArr(body.allowedCoaches),
    campusIds:parseArr(pkg.campusIds),
    usageStartDate:pkg.usageStartDate||'',
    usageEndDate:pkg.usageEndDate||'',
    purchaseDate,
    amountPaid:finalAmount,
    payMethod:body.payMethod||'',
    operator:opts.operator||body.operator||'',
    status:body.status||'active',
    createdAt:body.createdAt||now,
    updatedAt:now
  };
}
function validateProductInput(product){
  if(!String(product?.name||'').trim())throw new Error('请填写课程名称');
  if(!String(product?.type||'').trim())throw new Error('请选择课程类型');
  if((parseInt(product?.maxStudents)||0)<=0)throw new Error('人数必须大于 0');
  if(normalizeMoney(product?.price)<0)throw new Error('价格不能小于 0');
  if((parseInt(product?.lessons)||0)<0)throw new Error('课时不能小于 0');
}
function normalizeProductRecord(input,old=null,now=new Date().toISOString()){
  const base={...(old||{}),...(input||{})};
  const r={
    ...base,
    name:String(base.name||'').trim(),
    type:String(base.type||'').trim(),
    maxStudents:parseInt(base.maxStudents)||0,
    price:normalizeMoney(base.price),
    lessons:parseInt(base.lessons)||0,
    notes:String(base.notes||'').trim(),
    updatedAt:now
  };
  validateProductInput(r);
  return r;
}
function packageRefIds(values){
  return parseArr(values).map(x=>String(x||'').trim()).filter(Boolean);
}
function validatePackageInput(pkg,refs={}){
  if(!String(pkg?.name||'').trim())throw new Error('请填写课包名称');
  if(!pkg?.productId)throw new Error('请选择课程产品');
  if(refs.products&&!(refs.products||[]).some(p=>p.id===pkg.productId))throw new Error('课程产品不存在');
  if((parseInt(pkg.lessons)||0)<=0)throw new Error('课时必须大于 0');
  if(normalizeMoney(pkg.price)<=0)throw new Error('价格必须大于 0');
  if((parseInt(pkg.validDays)||0)<=0)throw new Error('有效天数必须大于 0');
  if((parseInt(pkg.maxStudents)||0)<=0)throw new Error('人数限制必须大于 0');
  if(pkg.saleStartDate&&pkg.saleEndDate&&pkg.saleEndDate<pkg.saleStartDate)throw new Error('活动结束时间不能早于活动开始时间');
  if(pkg.usageStartDate&&pkg.usageEndDate&&pkg.usageEndDate<pkg.usageStartDate)throw new Error('可用结束时间不能早于可用开始时间');
  for(const w of parseArr(pkg.dailyTimeWindows)){
    if((w.startTime&&!w.endTime)||(!w.startTime&&w.endTime))throw new Error('可用时段请填写完整');
    if(w.startTime&&w.endTime&&w.endTime<=w.startTime)throw new Error('可用结束时间必须晚于开始时间');
  }
  const coachIds=packageRefIds(pkg.coachIds);
  if(refs.coaches&&coachIds.length){
    const ok=new Set((refs.coaches||[]).flatMap(c=>[c.id,c.name]).filter(Boolean).map(String));
    if(coachIds.some(id=>!ok.has(String(id))))throw new Error('可用教练不存在');
  }
  const campusIds=packageRefIds(pkg.campusIds);
  if(refs.campuses&&campusIds.length){
    const ok=new Set((refs.campuses||[]).flatMap(c=>[c.id,c.code]).filter(Boolean).map(String));
    if(campusIds.some(id=>!ok.has(String(id))))throw new Error('可用校区不存在');
  }
}
function normalizePackageRecord(input,old=null,refs={},now=new Date().toISOString()){
  const base={...(old||{}),...(input||{})};
  const r={...base,lessons:parseInt(base.lessons)||0,price:normalizeMoney(base.price),validDays:parseInt(base.validDays)||0,maxStudents:parseInt(base.maxStudents)||0,status:base.status||'active',updatedAt:now};
  validatePackageInput(r,refs);
  return r;
}
function stableRuleValue(value){
  if(Array.isArray(value))return JSON.stringify(value.map(stableRuleValue));
  if(value&&typeof value==='object'){
    return JSON.stringify(Object.keys(value).sort().reduce((acc,k)=>{acc[k]=stableRuleValue(value[k]);return acc;},{}));
  }
  const arr=parseArr(value);
  if(arr.length)return JSON.stringify(arr.map(stableRuleValue));
  return String(value??'');
}
function changedCoreFields(oldRec,nextRec,fields){
  return fields.filter(k=>stableRuleValue(oldRec?.[k])!==stableRuleValue(nextRec?.[k]));
}
function assertCanEditProductWithReferences(oldProduct,nextProduct,refs={}){
  if(!oldProduct||!nextProduct)return;
  const used=(refs.classes||[]).some(c=>c.productId===oldProduct.id)||(refs.packages||[]).some(p=>p.productId===oldProduct.id);
  if(!used)return;
  if(changedCoreFields(oldProduct,nextProduct,['type','maxStudents','lessons','price']).length)throw new Error('该课程产品已有班次或售卖课包使用，不能修改核心字段');
}
function assertCanEditPackageWithPurchases(oldPackage,nextPackage,purchases=[]){
  if(!oldPackage||!nextPackage)return;
  if(!(purchases||[]).some(p=>p.packageId===oldPackage.id))return;
  const changed=changedCoreFields(oldPackage,nextPackage,[
    'productId','productName','courseType','price','lessons','validDays',
    'saleStartDate','saleEndDate','usageStartDate','usageEndDate',
    'dailyTimeWindows','timeBand','coachIds','coachNames','campusIds','maxStudents'
  ]);
  if(changed.length)throw new Error('该课包已有购买记录，不能修改核心规则');
}
function assertCanEditPurchaseWithLedger(oldPurchase,nextPurchase,entitlements=[],ledger=[]){
  if(!oldPurchase||!nextPurchase)return;
  const entitlementIds=new Set((entitlements||[]).filter(e=>e.purchaseId===oldPurchase.id).map(e=>e.id));
  if(!(ledger||[]).some(l=>entitlementIds.has(l.entitlementId)))return;
  const changed=Object.keys({...oldPurchase,...nextPurchase}).filter(k=>!['notes','updatedAt'].includes(k)&&stableRuleValue(oldPurchase[k])!==stableRuleValue(nextPurchase[k]));
  if(changed.length)throw new Error('该购买已有课时消耗，只能修改备注');
}
function purchaseHasEntitlementLedger(purchaseId,entitlements=[],ledger=[]){
  const entitlementIds=new Set((entitlements||[]).filter(e=>e.purchaseId===purchaseId).map(e=>e.id));
  return (ledger||[]).some(l=>entitlementIds.has(l.entitlementId));
}
function validatePurchaseInputForPackage(pkg,purchase,{isEdit=false,oldPackageId=''}={}){
  if(!pkg)throw new Error('售卖课包不存在');
  const samePackage=isEdit&&String(pkg.id||'')===String(oldPackageId||'');
  if(pkg.status&&pkg.status!=='active'&&!samePackage)throw new Error('该课包已停用');
  const purchaseDate=purchase?.purchaseDate||new Date().toISOString().slice(0,10);
  if(pkg.saleStartDate&&purchaseDate<pkg.saleStartDate)throw new Error('不在课包活动购买时间内');
  if(pkg.saleEndDate&&purchaseDate>pkg.saleEndDate)throw new Error('不在课包活动购买时间内');
}
function assertScheduleEntitlementRequired(rec){
  if(!isBillableSchedule(rec))return;
}
function scheduleParticipantSummary(rec){
  const actual=parseArr(rec?.studentIds).filter(Boolean);
  const expected=parseArr(rec?.expectedStudentIds).filter(Boolean);
  const base=expected.length?expected:actual;
  const actualSet=new Set(actual);
  return {
    expectedCount:base.length,
    actualCount:actual.length,
    absentCount:base.filter(id=>!actualSet.has(id)).length
  };
}
function syncEntitlementFromPurchase(pkg,purchase,student,oldEnt,now=new Date().toISOString()){
  const used=parseLessonValue(oldEnt?.usedLessons);
  const next=buildEntitlementFromPurchase(pkg,purchase,student,oldEnt?.id||uuidv4(),now);
  if(oldEnt?.createdAt)next.createdAt=oldEnt.createdAt;
  next.usedLessons=used;
  next.remainingLessons=parseLessonValue(next.totalLessons)-used;
  if(next.remainingLessons<0)throw new Error('该购买记录已有消耗，不能改成课时不足的课包');
  next.status=oldEnt?.status==='voided'?'voided':(next.remainingLessons<=0?'depleted':'active');
  return next;
}
async function writePurchaseAndEntitlementAtomic(store,purchaseTable,entitlementTable,purchase,entitlement){
  await store.put(purchaseTable,purchase.id,purchase);
  try{return await store.put(entitlementTable,entitlement.id,entitlement);}
  catch(err){
    await store.del(purchaseTable,purchase.id).catch(()=>null);
    throw err;
  }
}
function isScheduleInsideDailyTimeWindows(schedule,windows){
  const list=parseArr(windows);
  if(!list.length)return true;
  const ds=dateKey(schedule.startTime);
  if(!ds||ds!==dateKey(schedule.endTime))return false;
  const wd=dayOfWeek1to7(ds);
  const start=clockMin(String(schedule.startTime||'').slice(11,16));
  const end=clockMin(String(schedule.endTime||'').slice(11,16));
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return false;
  return list.some(w=>{
    const days=parseArr(w.daysOfWeek).map(n=>parseInt(n)).filter(Boolean);
    if(days.length&&!days.includes(wd))return false;
    const ws=clockMin(w.startTime),we=clockMin(w.endTime);
    return Number.isFinite(ws)&&Number.isFinite(we)&&start>=ws&&end<=we;
  });
}
function validateEntitlementForSchedule(entitlement,schedule){
  if(!isBillableSchedule(schedule))return;
  if(!entitlement)return;
  if(entitlement.status&&entitlement.status!=='active')throw new Error('课包余额不可用');
  const lessonCount=parseLessonValue(schedule.lessonCount,1);
  if(parseLessonValue(entitlement.remainingLessons)<lessonCount)throw new Error('课包剩余课时不足');
  const studentIds=parseArr(schedule.studentIds);
  if(entitlement.studentId&&studentIds.length&&!studentIds.includes(entitlement.studentId))throw new Error('课包所属学员不匹配');
  if(entitlement.courseType&&schedule.courseType&&entitlement.courseType!==schedule.courseType)throw new Error('课程类型不匹配');
  const coachIds=parseArr(entitlement.coachIds);
  const coachNames=parseArr(entitlement.coachNames);
  if(coachIds.length&&schedule.coachId&&!coachIds.includes(schedule.coachId))throw new Error('课包可用教练不匹配');
  if(coachNames.length&&schedule.coach&&!coachNames.some(n=>sameCoachName(n,schedule.coach)))throw new Error('课包可用教练不匹配');
  const saleCoachNames=[entitlement.ownerCoach,...parseArr(entitlement.allowedCoaches)].filter(Boolean);
  if(saleCoachNames.length&&schedule.coach&&!saleCoachNames.some(n=>sameCoachName(n,schedule.coach)))throw new Error('课包可上课教练不匹配');
  const campusIds=parseArr(entitlement.campusIds);
  if(campusIds.length&&schedule.campus&&!campusIds.includes(schedule.campus))throw new Error('课包可用校区不匹配');
  const usedDate=dateKey(schedule.startTime);
  const from=entitlement.usageStartDate||entitlement.validFrom;
  const until=entitlement.usageEndDate||entitlement.validUntil;
  if((from&&usedDate<from)||(until&&usedDate>until))throw new Error('不在课包可用日期范围');
  if(!isScheduleInsideDailyTimeWindows(schedule,entitlement.dailyTimeWindows))throw new Error('不在课包可用时间段');
  const max=parseInt(entitlement.maxStudents)||0;
  if(max>0&&studentIds.length>max)throw new Error('课包适用人数不匹配');
}
function entitlementMatchesCoach(entitlement,coachName){
  const name=String(coachName||'').trim();
  if(!name)return false;
  return String(entitlement?.ownerCoach||'').trim()===name||parseArr(entitlement?.allowedCoaches).some(c=>String(c||'').trim()===name);
}
function scheduleEntitlementDeltas(rec){
  if(!rec||!isScheduleLessonCharged(rec))return[];
  const lessonCount=parseLessonValue(rec.lessonCount,1);
  if(lessonCount<=0)return[];
  const ids=parseArr(rec.entitlementIds).filter(Boolean);
  if(ids.length)return ids.map(entitlementId=>({entitlementId,delta:lessonCount}));
  if(rec.entitlementId)return[{entitlementId:rec.entitlementId,delta:lessonCount}];
  return[];
}
function normalizeCoachLateInfo(input={}){
  const late=!!input.coachLateFree;
  return {
    coachLateFree:late,
    lateMinutes:late?Math.max(0,parseInt(input.lateMinutes)||0):0,
    lateReason:late?String(input.lateReason||'').trim():'',
    coachLateFieldFeeAmount:late?Math.max(0,parseFloat(input.coachLateFieldFeeAmount)||0):0,
    coachLateHandledAt:late?String(input.coachLateHandledAt||'').trim():'',
    coachLateHandledBy:late?String(input.coachLateHandledBy||'').trim():''
  };
}
function buildCoachLateSettlementRows(schedules=[],month=''){
  return (schedules||[]).filter(s=>{
    if(!s?.coachLateFree)return false;
    const ds=String(s.startTime||'').slice(0,7);
    return !month||ds===month;
  }).map(s=>({
    scheduleId:s.id||'',
    month:String(s.startTime||'').slice(0,7),
    coach:s.coach||'',
    date:String(s.startTime||'').slice(0,10),
    time:`${String(s.startTime||'').slice(11,16)}-${String(s.endTime||'').slice(11,16)}`,
    campus:s.campus||'',
    venue:s.venue||'',
    studentName:s.studentName||'',
    lateMinutes:parseInt(s.lateMinutes)||0,
    fieldFeeAmount:parseFloat(s.coachLateFieldFeeAmount)||0
  }));
}
function recommendEntitlements(entitlements,schedule){
  const options=(entitlements||[]).map(ent=>{
    const warnings=[];
    try{validateEntitlementForSchedule(ent,schedule);}
    catch(e){warnings.push(e.message);}
    return {
      studentId:ent.studentId||'',
      entitlementId:ent.id,
      id:ent.id,
      packageName:ent.packageName||'',
      remainingLessons:parseLessonValue(ent.remainingLessons),
      totalLessons:parseLessonValue(ent.totalLessons),
      validUntil:ent.validUntil||'',
      timeBand:ent.timeBand||'',
      selectable:warnings.length===0,
      warnings,
      _source:ent
    };
  }).sort((a,b)=>{
    if(a.selectable!==b.selectable)return a.selectable?-1:1;
    const av=a.validUntil||'9999-12-31',bv=b.validUntil||'9999-12-31';
    if(av!==bv)return av.localeCompare(bv);
    if(a.remainingLessons!==b.remainingLessons)return a.remainingLessons-b.remainingLessons;
    return String(a._source.purchaseDate||a._source.createdAt||'').localeCompare(String(b._source.purchaseDate||b._source.createdAt||''));
  });
  const clean=options.map(({_source,...rest})=>rest);
  return {recommended:clean.find(o=>o.selectable)||null,options:clean};
}
function resolveScheduleEntitlementDeltas(rec,entitlements=[]){
  const explicit=scheduleEntitlementDeltas(rec);
  if(explicit.length)return explicit;
  if(!rec||!isBillableSchedule(rec))return[];
  const lessonCount=parseLessonValue(rec.lessonCount,1);
  if(lessonCount<=0)return[];
  return parseArr(rec.studentIds).filter(Boolean).map(studentId=>{
    const options=(entitlements||[]).filter(e=>e.studentId===studentId);
    const {recommended}=recommendEntitlements(options,{...rec,studentIds:[studentId]});
    return recommended?{studentId,entitlementId:recommended.entitlementId,delta:lessonCount}:null;
  }).filter(Boolean);
}
function applyEntitlementLessonDelta(entitlement,delta,now=new Date().toISOString()){
  const total=parseLessonValue(entitlement.totalLessons);
  const used=Math.max(0,parseLessonValue(entitlement.usedLessons)-parseLessonValue(delta));
  if(used>total)throw new Error('课包剩余课时不足');
  const remaining=Math.max(0,total-used);
  const status=remaining<=0?'depleted':(entitlement.status==='depleted'?'active':(entitlement.status||'active'));
  return {...entitlement,usedLessons:used,remainingLessons:remaining,status,updatedAt:now};
}
function assertScheduleEditableAfterFeedback(oldRec,nextRec,feedbacks){
  if(!oldRec||!nextRec)return;
  if(!(feedbacks||[]).some(f=>f.scheduleId===oldRec.id))return;
  const coreFields=['studentName','classId','entitlementId','startTime','endTime','coach','coachId','campus','venue','courseType','isTrial','lessonCount','status'];
  const changed=coreFields.filter(k=>String(oldRec[k]??'')!==String(nextRec[k]??''));
  const oldStudents=parseArr(oldRec.studentIds).sort();
  const nextStudents=parseArr(nextRec.studentIds).sort();
  const sameStudents=oldStudents.length===nextStudents.length&&oldStudents.every((id,idx)=>id===nextStudents[idx]);
  if(!sameStudents)changed.push('studentIds');
  if(changed.length)throw new Error('该排课已有课后反馈，不能修改学员、班次、课包余额、时间、教练、校区、场地、课程类型、课时或状态');
}
function scheduleEntitlementDelta(rec){
  return scheduleEntitlementDeltas(rec)[0]||null;
}
function diffScheduleEntitlementDeltas(oldDeltas=[],nextDeltas=[]){
  const keyOf=d=>`${d.entitlementId}|${parseLessonValue(d.delta)}`;
  const nextCounts=new Map();
  nextDeltas.forEach(d=>nextCounts.set(keyOf(d),(nextCounts.get(keyOf(d))||0)+1));
  const returns=[];
  oldDeltas.forEach(d=>{
    const key=keyOf(d);
    const count=nextCounts.get(key)||0;
    if(count>0)nextCounts.set(key,count-1);
    else returns.push(d);
  });
  const oldCounts=new Map();
  oldDeltas.forEach(d=>oldCounts.set(keyOf(d),(oldCounts.get(keyOf(d))||0)+1));
  const consumes=[];
  nextDeltas.forEach(d=>{
    const key=keyOf(d);
    const count=oldCounts.get(key)||0;
    if(count>0)oldCounts.set(key,count-1);
    else consumes.push(d);
  });
  return {returns,consumes};
}
async function assertScheduleEntitlementCapacity(nextRec,oldRec){
  const nextDeltas=scheduleEntitlementDeltas(nextRec);
  if(!nextDeltas.length)return null;
  const oldDeltas=scheduleEntitlementDeltas(oldRec);
  const oldMap=new Map(oldDeltas.map(d=>[d.entitlementId,d.delta]));
  const checked=[];
  for(const nextDelta of nextDeltas){
    const ent=await getCachedRow(T_ENTITLEMENTS,nextDelta.entitlementId);
    if(!ent)throw new Error('课包余额不存在');
    const adjusted=oldMap.has(nextDelta.entitlementId)?{...ent,status:'active',remainingLessons:parseLessonValue(ent.remainingLessons)+oldMap.get(nextDelta.entitlementId)}:ent;
    validateEntitlementForSchedule(adjusted,{...nextRec,studentIds:[adjusted.studentId].filter(Boolean)});
    checked.push(adjusted);
  }
  return checked;
}
async function applyEntitlementDelta(entitlementId,scheduleId,delta,action,reason,user){
  if(!entitlementId||!delta)return null;
  const ent=await getCachedRow(T_ENTITLEMENTS,entitlementId);
  if(!ent)return null;
  const next=applyEntitlementLessonDelta(ent,delta);
  await put(T_ENTITLEMENTS,entitlementId,next);
  const ledger={
    id:uuidv4(),
    entitlementId,
    studentId:ent.studentId||'',
    scheduleId:scheduleId||'',
    lessonDelta:delta,
    action,
    reason,
    operator:user?.name||'',
    createdAt:new Date().toISOString()
  };
  await put(T_ENTITLEMENT_LEDGER,ledger.id,ledger);
  return {entitlement:next,ledger};
}
function collectScheduleRiskWarnings(candidate,schedules,excludeId){
  if(!isBillableSchedule(candidate)||!candidate.coach||!candidate.campus||!candidate.startTime||!candidate.endTime)return[];
  const warnings=[];
  for(const rec of schedules||[]){
    if(!rec||rec.id===(excludeId||candidate.id)||!isBillableSchedule(rec))continue;
    if(rec.coach!==candidate.coach||!rec.campus||rec.campus===candidate.campus)continue;
    const gapBefore=minutesBetween(rec.endTime,candidate.startTime);
    if(gapBefore!==null&&dateMs(rec.endTime)<=dateMs(candidate.startTime)&&gapBefore<60){
      warnings.push(`跨校区提醒：${candidate.coach}上一节在 ${rec.campus}，下一节在 ${candidate.campus}，中间仅 ${gapBefore} 分钟`);
      continue;
    }
    const gapAfter=minutesBetween(candidate.endTime,rec.startTime);
    if(gapAfter!==null&&dateMs(candidate.endTime)<=dateMs(rec.startTime)&&gapAfter<60){
      warnings.push(`跨校区提醒：${candidate.coach}上一节在 ${candidate.campus}，下一节在 ${rec.campus}，中间仅 ${gapAfter} 分钟`);
    }
  }
  return [...new Set(warnings)];
}
function feedbackScopeForSchedule(schedule={}){
  const studentIds=parseArr(schedule?.studentIds).filter(Boolean);
  const courseType=String(schedule?.courseType||schedule?.type||schedule?.title||'').trim();
  if(schedule?.feedbackScope==='class'||schedule?.feedbackScope==='student')return schedule.feedbackScope;
  if(String(schedule?.classId||'').trim()&&(studentIds.length>1||/班课|训练营|小班|大师课/.test(courseType)))return 'class';
  return 'student';
}
function buildFeedbackRecord(body,base,user){
  if(!body.scheduleId)throw new Error('缺少排课ID');
  const now=new Date().toISOString();
  const studentIds=parseArr(body.studentIds).filter(Boolean);
  const feedbackScope=feedbackScopeForSchedule(body);
  const studentId=feedbackScope==='class'?'':(body.studentId||studentIds[0]||'');
  return {
    ...base,
    scheduleId:body.scheduleId,
    classId:body.classId||'',
    feedbackScope,
    studentId,
    studentIds,
    studentName:body.studentName||'',
    coach:body.coach||user?.name||'',
    startTime:body.startTime||'',
    campus:body.campus||'',
    venue:body.venue||'',
    lessonCount:body.lessonCount||0,
    isTrial:!!body.isTrial,
    remainingLessons:body.remainingLessons||'',
    practicedToday:body.practicedToday||body.focus||body.performance||'',
    knowledgePoint:body.knowledgePoint||body.problems||'',
    nextTraining:body.nextTraining||body.nextAdvice||'',
    playerLevel:body.playerLevel||'',
    goalType:body.goalType||'',
    experienceBackground:body.experienceBackground||'',
    mainIssues:body.mainIssues||'',
    conversionIntent:body.conversionIntent||'',
    recommendedProductType:body.recommendedProductType||'',
    recommendedReason:body.recommendedReason||'',
    needOpsFollowUp:body.needOpsFollowUp===true||body.needOpsFollowUp==='是',
    opsFollowUpPriority:body.opsFollowUpPriority||'',
    opsFollowUpSuggestion:body.opsFollowUpSuggestion||'',
    sentToStudent:body.sentToStudent||false,
    updatedBy:user?.name||'',
    updatedAt:now,
    createdAt:base.createdAt||now
  };
}
function assertCanWriteFeedback(user,schedule){
  if(user?.role==='admin')return;
  const coachName=String(user?.coachName||user?.name||'').trim();
  const scheduleCoach=String(schedule?.coach||'').trim();
  if(coachName&&scheduleCoach&&coachName===scheduleCoach)return;
  throw new Error('只能填写自己的课程反馈');
}
function filterLoadAllForUser(data,user){
  const normalized={
    courts:Array.isArray(data?.courts)?data.courts:[],
    students:Array.isArray(data?.students)?data.students:[],
    products:Array.isArray(data?.products)?data.products:[],
    packages:Array.isArray(data?.packages)?data.packages:[],
    purchases:Array.isArray(data?.purchases)?data.purchases:[],
    entitlements:Array.isArray(data?.entitlements)?data.entitlements:[],
    entitlementLedger:Array.isArray(data?.entitlementLedger)?data.entitlementLedger:[],
    membershipPlans:Array.isArray(data?.membershipPlans)?data.membershipPlans:[],
    membershipAccounts:Array.isArray(data?.membershipAccounts)?data.membershipAccounts:[],
    membershipOrders:Array.isArray(data?.membershipOrders)?data.membershipOrders:[],
    membershipBenefitLedger:Array.isArray(data?.membershipBenefitLedger)?data.membershipBenefitLedger:[],
    membershipAccountEvents:Array.isArray(data?.membershipAccountEvents)?data.membershipAccountEvents:[],
    pricePlans:Array.isArray(data?.pricePlans)?data.pricePlans:[],
    plans:Array.isArray(data?.plans)?data.plans:[],
    schedule:Array.isArray(data?.schedule)?data.schedule:[],
    coaches:Array.isArray(data?.coaches)?data.coaches:[],
    classes:Array.isArray(data?.classes)?data.classes:[],
    campuses:Array.isArray(data?.campuses)?data.campuses:[],
    feedbacks:Array.isArray(data?.feedbacks)?data.feedbacks:[]
  };
  if(user?.role==='admin')return normalized;
  const coachId=String(user?.coachId||user?.id||'').trim();
  const coachName=String(user?.coachName||user?.name||'').trim();
  const authId=String(user?.id||user?.username||'').trim();
  const hasReliableCoachId=!!(coachId&&coachId!==authId);
  const rowMatchesCoach=(row)=>{
    const rowCoachId=String(row?.coachId||row?.primaryCoachId||'').trim();
    const rowCoachName=String(row?.coach||row?.primaryCoach||'').trim();
    if(coachId&&rowCoachId&&rowCoachId===coachId)return true;
    if(hasReliableCoachId&&rowCoachId)return false;
    return coachName&&rowCoachName===coachName;
  };
  const ownSchedule=normalized.schedule.filter(rowMatchesCoach);
  const scheduleIds=new Set(ownSchedule.map(s=>s.id).filter(Boolean));
  const scheduleClassIds=new Set(ownSchedule.map(s=>s.classId).filter(Boolean));
  const ownClasses=normalized.classes.filter(c=>rowMatchesCoach(c)||scheduleClassIds.has(c.id));
  const classIds=new Set([...ownClasses.map(c=>c.id).filter(Boolean),...scheduleClassIds]);
  const studentIds=new Set();
  normalized.students.filter(rowMatchesCoach).forEach(s=>studentIds.add(s.id));
  ownSchedule.forEach(s=>parseArr(s.studentIds).forEach(id=>studentIds.add(id)));
  ownClasses.forEach(c=>parseArr(c.studentIds).forEach(id=>studentIds.add(id)));
  const ownPlans=normalized.plans.filter(p=>studentIds.has(p.studentId)||classIds.has(p.classId));
  ownPlans.forEach(p=>{if(p.studentId)studentIds.add(p.studentId);});
  const safeEntitlements=normalized.entitlements.filter(e=>studentIds.has(e.studentId)).map(e=>({
    id:e.id,studentId:e.studentId,studentName:e.studentName,packageName:e.packageName,courseType:e.courseType,totalLessons:e.totalLessons,usedLessons:e.usedLessons,remainingLessons:e.remainingLessons,validFrom:e.validFrom,validUntil:e.validUntil,timeBand:e.timeBand,status:e.status,ownerCoach:e.ownerCoach,allowedCoaches:parseArr(e.allowedCoaches)
  }));
  const safeLedger=normalized.entitlementLedger.filter(l=>
    scheduleIds.has(l.scheduleId)||(
      studentIds.has(l.studentId)&&!l.scheduleId&&!!importedLedgerMonthKey(l)&&Number(l.lessonDelta)<0
    )
  ).map(l=>({
    id:l.id,entitlementId:l.entitlementId,studentId:l.studentId,scheduleId:l.scheduleId,lessonDelta:l.lessonDelta,action:l.action,reason:l.reason,createdAt:l.createdAt,relatedDate:l.relatedDate,sourceMonth:l.sourceMonth,importSource:l.importSource,notes:l.notes
  }));
  const safePurchases=normalized.purchases.filter(p=>studentIds.has(p.studentId)).map(p=>({
    id:p.id,
    studentId:p.studentId||'',
    studentName:p.studentName||'',
    purchaseDate:p.purchaseDate||'',
    createdAt:p.createdAt||'',
    status:p.status||'active'
  }));
  return {
    courts:[],
    students:normalized.students.filter(s=>studentIds.has(s.id)),
    products:normalized.products,
    packages:[],
    purchases:safePurchases,
    entitlements:safeEntitlements,
    entitlementLedger:normalizeEntitlementLedgerRowsForView(safeLedger),
    membershipPlans:[],
    membershipAccounts:[],
    membershipOrders:[],
    membershipBenefitLedger:[],
    membershipAccountEvents:[],
    pricePlans:[],
    plans:ownPlans,
    schedule:ownSchedule,
    coaches:normalized.coaches.filter(c=>String(c.name||'').trim()===coachName),
    classes:ownClasses,
    campuses:normalized.campuses,
    feedbacks:normalized.feedbacks.filter(f=>scheduleIds.has(f.scheduleId))
  };
}
function sameCoachName(a,b){return String(a||'').trim()===String(b||'').trim();}
function assertUniqueCoachName(name,coaches,excludeId){
  const coach=String(name||'').trim();
  if(!coach)return;
  if((coaches||[]).some(c=>c.id!==excludeId&&sameCoachName(c.name,coach)))throw new Error('教练姓名已存在');
}
function mergeStoredAuthUser(tokenUser,storedUser){
  const source=storedUser||tokenUser||{};
  const role=source.role||tokenUser?.role||'';
  const name=source.name||tokenUser?.name||'';
  const id=source.id||tokenUser?.id||'';
  const username=source.username||tokenUser?.username||'';
  return {
    id,
    name,
    role,
    status:source.status||tokenUser?.status||'active',
    username,
    coachId:source.coachId||tokenUser?.coachId||(role==='editor'?(id||username):''),
    coachName:source.coachName||(role==='editor'?name:(tokenUser?.coachName||'')),
    matchPermissions:source.matchPermissions||source.permissions||tokenUser?.matchPermissions||tokenUser?.permissions||[]
  };
}
function assertAuthUserActive(user){
  if(String(user?.status||'active')==='inactive')throw new Error('账号已停用');
}
function buildWechatCode2SessionUrl(appid,secret,code){
  return `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
}
function extractWechatOpenId(data){
  if(data?.openid)return String(data.openid);
  const msg=data?.errmsg||data?.errcode||'unknown';
  throw new Error(`微信登录失败：${msg}`);
}
function resolveWechatMiniConfig(kind='coach'){
  if(kind==='match'){
    return {
      appid: MATCH_MINIPROGRAM_APPID || WECHAT_MINIPROGRAM_APPID,
      secret: MATCH_MINIPROGRAM_SECRET || WECHAT_MINIPROGRAM_SECRET,
      errorText: '缺少约球小程序密钥配置'
    };
  }
  return {
    appid: WECHAT_MINIPROGRAM_APPID,
    secret: WECHAT_MINIPROGRAM_SECRET,
    errorText: '缺少微信小程序密钥配置'
  };
}
async function fetchWechatSession(code,kind='coach'){
  const config=resolveWechatMiniConfig(kind);
  if(!config.secret)throw new Error(config.errorText);
  const url=buildWechatCode2SessionUrl(config.appid,config.secret,code);
  const res=await fetch(url);
  const data=await res.json();
  return data;
}
function buildWechatBoundUser(user,openid,now=new Date().toISOString()){
  return {...user,wechatOpenId:String(openid||''),wechatBoundAt:now};
}
function buildWechatUnboundUser(user){
  return {...user,wechatOpenId:'',wechatBoundAt:''};
}
function buildAdminUserView(u){
  return {
    id:u.id,
    name:u.name,
    role:u.role,
    status:u.status||'active',
    coachId:u.coachId||'',
    coachName:u.coachName||'',
    matchPermissions:userMatchPermissions(u),
    wechatBound:!!u.wechatOpenId,
    wechatBoundAt:u.wechatBoundAt||''
  };
}
function buildWechatAccessTokenUrl(appid,secret){
  return `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`;
}
function extractWechatAccessToken(data){
  if(data?.access_token)return String(data.access_token);
  const msg=data?.errmsg||data?.errcode||'unknown';
  throw new Error(`微信 access_token 获取失败：${msg}`);
}
async function fetchWechatAccessToken(kind='coach'){
  const config=resolveWechatMiniConfig(kind);
  if(!config.secret)throw new Error(config.errorText);
  const now=Date.now();
  const cached=wechatAccessTokenCacheByApp.get(config.appid);
  if(cached&&cached.expiresAt>now)return cached.token;
  const res=await fetch(buildWechatAccessTokenUrl(config.appid,config.secret));
  const data=await res.json();
  const token=extractWechatAccessToken(data);
  const ttlMs=Math.max(300000,((parseInt(data.expires_in)||7200)-300)*1000);
  wechatAccessTokenCacheByApp.set(config.appid,{token,expiresAt:now+ttlMs});
  return token;
}
async function fetchWechatPhoneNumber(code,kind='coach'){
  const token=await fetchWechatAccessToken(kind);
  const res=await fetch(`https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(token)}`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({code})
  });
  const data=await res.json();
  if(data.errcode&&data.errcode!==0)throw new Error(`微信手机号获取失败：${data.errmsg||data.errcode}`);
  const phone=data?.phone_info?.phoneNumber||data?.phone_info?.purePhoneNumber;
  if(!phone)throw new Error('微信未返回手机号');
  return assertPhone(phone);
}
function truncateWechatValue(value,max=20){
  const text=String(value||'').trim();
  return text.length>max?text.slice(0,max):text;
}
function scheduleNotifyLocation(schedule){
  return [schedule.campus,schedule.venue||schedule.externalVenueName||schedule.externalCourtName].filter(Boolean).join(' ')||'待确认';
}
function findWechatScheduleRecipient(schedule,users=[]){
  const coachId=String(schedule?.coachId||'').trim();
  const coachName=String(schedule?.coach||'').trim();
  return (users||[]).find(u=>{
    if(!u?.wechatOpenId)return false;
    if(String(u.role||'')!=='editor')return false;
    if(coachId&&String(u.coachId||'').trim()===coachId)return true;
    return coachName&&String(u.coachName||u.name||'').trim()===coachName;
  })||null;
}
function findWechatUserByOpenId(users=[],openid=''){
  const key=String(openid||'').trim();
  if(!key)return null;
  const matched=(users||[]).filter(u=>String(u?.wechatOpenId||'').trim()===key);
  return matched.find(u=>String(u?.role||'')==='editor')||matched[0]||null;
}
function buildScheduleSubscribeMessage({templateId,openid,schedule}){
  const start=String(schedule?.startTime||'').trim();
  const scheduleId=encodeURIComponent(String(schedule?.id||''));
  return {
    touser:openid,
    template_id:templateId,
    page:`pages/detail/detail${scheduleId?`?scheduleId=${scheduleId}`:''}`,
    data:{
      thing1:{value:truncateWechatValue(schedule?.courseType||'课程')},
      time2:{value:start},
      thing3:{value:truncateWechatValue(schedule?.studentName||'学员')},
      thing4:{value:truncateWechatValue(scheduleNotifyLocation(schedule))}
    }
  };
}
async function sendWechatSubscribeMessage(message){
  const token=await fetchWechatAccessToken();
  const res=await fetch(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(token)}`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(message)
  });
  const data=await res.json();
  if(data.errcode&&data.errcode!==0)throw new Error(`微信订阅消息发送失败：${data.errmsg||data.errcode}`);
  return data;
}
function buildMatchSubscribeMessage({templateId,openid,match,content}){
  return {
    touser:openid,
    template_id:templateId,
    page:`pages/match-detail/index?id=${encodeURIComponent(String(match?.id||''))}`,
    data:{
      thing1:{value:truncateWechatValue(match?.title||'约球通知')},
      thing2:{value:truncateWechatValue(content||'约球状态已更新')},
      time3:{value:String(match?.starttime||match?.startTime||'').replace('T',' ').slice(0,16)}
    }
  };
}
async function notifyMatchUsers(matchId,action){
  if(!MATCH_WECHAT_TEMPLATE_ID)return {skipped:true,reason:'missing_template'};
  const pool=getMatchSqlPool();
  const [matchRes,usersRes]=await Promise.all([
    pool.query('SELECT * FROM match_posts WHERE id=$1',[matchId]),
    pool.query("SELECT DISTINCT u.openid,u.id FROM match_users u LEFT JOIN match_registrations r ON r.userId=u.id WHERE r.matchId=$1 OR u.id=(SELECT creatorUserId FROM match_posts WHERE id=$1)",[matchId])
  ]);
  const match=matchRes.rows[0];
  if(!match)return {skipped:true,reason:'missing_match'};
  let sent=0,failed=0;
  for(const user of usersRes.rows){
    try{
      await sendWechatSubscribeMessage(buildMatchSubscribeMessage({templateId:MATCH_WECHAT_TEMPLATE_ID,openid:user.openid,match,content:matchNotificationText(action,match.title)}));
      sent++;
    }catch(err){
      failed++;
      await pool.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'admin_user','system','notify_failed',JSON.stringify({userId:user.id,action}),JSON.stringify({error:String(err?.message||err)})]).catch(()=>null);
    }
  }
  return {sent,failed};
}
async function notifyCoachScheduleCreated(schedule){
  if(!WECHAT_SCHEDULE_TEMPLATE_ID)return {skipped:true,reason:'missing_template'};
  const users=await getCachedScan(T_USERS).catch(()=>[]);
  const recipient=findWechatScheduleRecipient(schedule,users);
  if(!recipient)return {skipped:true,reason:'missing_openid'};
  const message=buildScheduleSubscribeMessage({templateId:WECHAT_SCHEDULE_TEMPLATE_ID,openid:recipient.wechatOpenId,schedule});
  await sendWechatSubscribeMessage(message);
  return {sent:true,userId:recipient.id};
}
function buildScheduleNotificationUpdate(schedule,result={},type='schedule_created',now=new Date().toISOString()){
  const sent=!!result.sent;
  const reason=String(result.reason||'').trim();
  const error=String(result.error||'').trim();
  const log={
    type,
    status:sent?'sent':'failed',
    channel:'wechat_subscribe',
    targetUserId:String(result.userId||'').trim(),
    reason,
    error,
    createdAt:now
  };
  return {
    notifyStatus:sent?'已通知教练':'通知失败',
    lastNotifyAt:now,
    lastNotifyError:sent?'':(error||reason||'通知失败'),
    notificationLogs:[...parseArr(schedule?.notificationLogs),log]
  };
}
function collectCourseReminderCandidates(rows=[],now=new Date()){
  const nowMs=now instanceof Date?now.getTime():dateMs(now);
  const minMs=nowMs+45*60000;
  const maxMs=nowMs+75*60000;
  const active=(rows||[]).filter(s=>effectiveScheduleStatus(s,now)==='已排课'&&!s.courseReminderSentAt&&Number.isFinite(dateMs(s.startTime)));
  return active
    .filter(s=>{const start=dateMs(s.startTime);return start>=minMs&&start<=maxMs;})
    .sort((a,b)=>dateMs(a.startTime)-dateMs(b.startTime))
    .map(schedule=>{
      const sameCoach=(rows||[]).filter(s=>s.id!==schedule.id&&String(s.coach||'').trim()===String(schedule.coach||'').trim());
      const previous=sameCoach
        .filter(s=>Number.isFinite(dateMs(s.endTime))&&dateMs(s.endTime)<=dateMs(schedule.startTime))
        .sort((a,b)=>dateMs(b.endTime)-dateMs(a.endTime))[0]||null;
      const gap=previous?Math.round((dateMs(schedule.startTime)-dateMs(previous.endTime))/60000):null;
      const crossCampus=!!(previous&&gap!==null&&gap>=0&&gap<=90&&String(previous.campus||'')!==String(schedule.campus||''));
      return {schedule,previous,gap,crossCampus};
    });
}
function buildCourseReminderSubscribeMessage({templateId,openid,schedule,crossCampus=false}){
  const scheduleId=encodeURIComponent(String(schedule?.id||''));
  return {
    touser:openid,
    template_id:templateId,
    page:`pages/detail/detail${scheduleId?`?scheduleId=${scheduleId}`:''}`,
    data:{
      thing1:{value:truncateWechatValue(crossCampus?'跨校区，请预留通勤时间':'即将上课，请提前准备')},
      time2:{value:String(schedule?.startTime||'').trim()},
      thing3:{value:truncateWechatValue(schedule?.studentName||'学员')},
      thing4:{value:truncateWechatValue(schedule?.courseType||'课程')}
    }
  };
}
async function sendCourseReminders({now=new Date()}={}){
  if(!WECHAT_COURSE_REMINDER_TEMPLATE_ID)return {success:true,skipped:true,reason:'missing_template',sent:0,failed:0};
  const [rows,users]=await Promise.all([getCachedScan(T_SCHEDULE).catch(()=>[]),getCachedScan(T_USERS).catch(()=>[])]);
  const candidates=collectCourseReminderCandidates(rows,now);
  const result={success:true,checked:candidates.length,sent:0,failed:0,skipped:0,items:[]};
  for(const item of candidates){
    const recipient=findWechatScheduleRecipient(item.schedule,users);
    if(!recipient){result.skipped++;result.items.push({id:item.schedule.id,skipped:true,reason:'missing_openid'});continue;}
    try{
      const message=buildCourseReminderSubscribeMessage({templateId:WECHAT_COURSE_REMINDER_TEMPLATE_ID,openid:recipient.wechatOpenId,schedule:item.schedule,crossCampus:item.crossCampus});
      await sendWechatSubscribeMessage(message);
      await put(T_SCHEDULE,item.schedule.id,{...item.schedule,courseReminderSentAt:new Date().toISOString(),courseReminderCrossCampus:item.crossCampus?'true':'false'});
      result.sent++;
      result.items.push({id:item.schedule.id,sent:true,crossCampus:item.crossCampus});
    }catch(err){
      result.failed++;
      result.items.push({id:item.schedule.id,sent:false,error:err.message});
    }
  }
  return result;
}
function operatorAccountName(user){
  return String(user?.username||user?.id||user?.name||'').trim();
}
function normalizeOperatorAccountName(operator,users=[]){
  const raw=String(operator||'').trim();
  if(!raw)return '';
  const byUsername=(users||[]).find(u=>String(u?.username||'').trim()===raw||String(u?.id||'').trim()===raw);
  if(byUsername)return String(byUsername.username||byUsername.id||raw).trim();
  const byName=(users||[]).find(u=>String(u?.name||'').trim()===raw);
  return String(byName?.username||byName?.id||raw).trim();
}
function buildCoachRenameUpdates(oldName,newName,data,now=new Date().toISOString()){
  const oldCoach=String(oldName||'').trim();
  const nextCoach=String(newName||'').trim();
  const empty={classes:[],schedule:[],plans:[],users:[],feedbacks:[]};
  if(!oldCoach||!nextCoach||oldCoach===nextCoach)return empty;
  const touch=row=>({...row,updatedAt:now});
  return {
    classes:(data.classes||[]).filter(r=>sameCoachName(r.coach,oldCoach)).map(r=>touch({...r,coach:nextCoach})),
    schedule:(data.schedule||[]).filter(r=>sameCoachName(r.coach,oldCoach)).map(r=>touch({...r,coach:nextCoach})),
    plans:(data.plans||[]).filter(r=>sameCoachName(r.coach,oldCoach)).map(r=>touch({...r,coach:nextCoach})),
    users:(data.users||[]).filter(r=>sameCoachName(r.coachName,oldCoach)).map(r=>touch({...r,coachName:nextCoach})),
    feedbacks:(data.feedbacks||[]).filter(r=>sameCoachName(r.coach,oldCoach)).map(r=>touch({...r,coach:nextCoach}))
  };
}
function assertCanDeleteCoachName(name,data,coachId=''){
  const coach=String(name||'').trim();
  const cid=String(coachId||'').trim();
  if(!coach&&!cid)return;
  const coachRefHit=r=>parseArr(r.coachNames).some(n=>sameCoachName(n,coach))||parseArr(r.coachIds).some(n=>sameCoachName(n,coach)||String(n||'').trim()===cid);
  const used=
    (data.classes||[]).some(r=>sameCoachName(r.coach,coach))||
    (data.schedule||[]).some(r=>sameCoachName(r.coach,coach))||
    (data.plans||[]).some(r=>sameCoachName(r.coach,coach))||
    (data.users||[]).some(r=>sameCoachName(r.coachName,coach))||
    (data.feedbacks||[]).some(r=>sameCoachName(r.coach,coach))||
    (data.packages||[]).some(coachRefHit)||
    (data.entitlements||[]).some(coachRefHit);
  if(used)throw new Error('该教练已有班次、排课、学习计划、账号、反馈、课包或权益关联，不能直接删除');
}
async function loadCoachReferenceData(){
  const [classes,schedule,plans,users,feedbacks,packages,entitlements]=await Promise.all([
    timed('scan classes for coach references',()=>scan(T_CLASSES).catch(()=>[])),
    timed('scan schedule for coach references',()=>scan(T_SCHEDULE).catch(()=>[])),
    timed('scan plans for coach references',()=>scan(T_PLANS).catch(()=>[])),
    timed('scan users for coach references',()=>scan(T_USERS).catch(()=>[])),
    timed('scan feedbacks for coach references',()=>withTimeout(scanFeedbacks().catch(()=>[]),3000,[])),
    timed('scan packages for coach references',()=>scan(T_PACKAGES).catch(()=>[])),
    timed('scan entitlements for coach references',()=>scan(T_ENTITLEMENTS).catch(()=>[]))
  ]);
  return {classes,schedule,plans,users,feedbacks,packages,entitlements};
}
async function applyCoachRename(oldName,newName){
  const updates=buildCoachRenameUpdates(oldName,newName,await loadCoachReferenceData());
  await Promise.all([
    ...updates.classes.map(r=>put(T_CLASSES,r.id,r)),
    ...updates.schedule.map(r=>put(T_SCHEDULE,r.id,r)),
    ...updates.plans.map(r=>put(T_PLANS,r.id,r)),
    ...updates.users.map(r=>put(T_USERS,r.id,r)),
    ...updates.feedbacks.map(r=>putFeedback(r.id,r))
  ]);
  return updates;
}
function buildStudentIdentityUpdates(oldStudent,nextStudent,data,now=new Date().toISOString()){
  const id=oldStudent?.id||nextStudent?.id;
  const name=String(nextStudent?.name||'').trim();
  const phone=normalizePhone(nextStudent?.phone);
  const oldName=String(oldStudent?.name||'').trim();
  const oldPhone=normalizePhone(oldStudent?.phone);
  const empty={plans:[],schedule:[],purchases:[],entitlements:[],feedbacks:[],courts:[]};
  if(!id||(!name&&!phone))return empty;
  const changedName=String(oldStudent?.name||'')!==String(nextStudent?.name||'');
  const changedPhone=normalizePhone(oldStudent?.phone)!==phone;
  if(!changedName&&!changedPhone)return empty;
  const touch=row=>({...row,updatedAt:now});
  return {
    plans:(data.plans||[]).filter(r=>r.studentId===id).map(r=>touch({...r,studentName:name||r.studentName,studentPhone:phone})),
    schedule:(data.schedule||[]).filter(r=>parseArr(r.studentIds).includes(id)||r.studentId===id).map(r=>touch({...r,studentName:name||r.studentName})),
    purchases:(data.purchases||[]).filter(r=>r.studentId===id).map(r=>touch({...r,studentName:name||r.studentName,studentPhone:phone})),
    entitlements:(data.entitlements||[]).filter(r=>r.studentId===id).map(r=>touch({...r,studentName:name||r.studentName})),
    feedbacks:(data.feedbacks||[]).filter(r=>r.studentId===id||parseArr(r.studentIds).includes(id)).map(r=>touch({...r,studentName:name||r.studentName})),
    courts:(data.courts||[]).filter(r=>{
      const ids=parseArr(r.studentIds);
      if(ids.includes(id)||r.studentId===id)return false;
      const exactName=oldName&&String(r.name||'').trim()===oldName;
      const exactPhone=oldPhone&&normalizePhone(r.phone)===oldPhone;
      return exactName||exactPhone;
    }).map(r=>touch({...r,studentId:id,studentIds:[id]}))
  };
}
async function loadStudentReferenceData(){
  const [plans,schedule,purchases,entitlements,feedbacks,courts]=await Promise.all([
    getCachedScan(T_PLANS).catch(()=>[]),
    getCachedScan(T_SCHEDULE).catch(()=>[]),
    scan(T_PURCHASES).catch(()=>[]),
    getCachedScan(T_ENTITLEMENTS).catch(()=>[]),
    withTimeout(scanFeedbacks().catch(()=>[]),3000,[]),
    getCachedScan(T_COURTS).catch(()=>[])
  ]);
  return {plans,schedule,purchases,entitlements,feedbacks,courts};
}
async function applyStudentIdentityUpdate(oldStudent,nextStudent){
  const updates=buildStudentIdentityUpdates(oldStudent,nextStudent,await loadStudentReferenceData());
  await Promise.all([
    ...updates.plans.map(r=>put(T_PLANS,r.id,r)),
    ...updates.schedule.map(r=>put(T_SCHEDULE,r.id,r)),
    ...updates.purchases.map(r=>put(T_PURCHASES,r.id,r)),
    ...updates.entitlements.map(r=>put(T_ENTITLEMENTS,r.id,r)),
    ...updates.feedbacks.map(r=>putFeedback(r.id,r)),
    ...updates.courts.map(r=>put(T_COURTS,r.id,r))
  ]);
  return updates;
}
async function validateScheduleSave(nextRec,oldRec){
  const schedules=await timed('scan schedule for conflict check',()=>getCachedScan(T_SCHEDULE));
  validateScheduleConflicts(nextRec,schedules,nextRec.id);
  validateCourtBookingConflicts(nextRec,await timed('scan courts for schedule conflict check',()=>getCachedScan(T_COURTS).catch(()=>[])));
  const oldDelta=scheduleLessonDelta(oldRec);
  const nextDelta=scheduleLessonDelta(nextRec);
  if(nextRec?.classId&&isBillableSchedule(nextRec)){
    const cls=await get(T_CLASSES,nextRec.classId);
    assertClassSchedulable(cls,nextRec);
    if(nextDelta){
    assertLessonCapacity(cls,oldDelta,nextDelta);
    }
  }
  return {warnings:collectScheduleRiskWarnings(nextRec,schedules,nextRec.id)};
}

let inited=false;
let initPromise=null;
let defaultPricePlanSyncStarted=false;
const DEFAULT_COACH_USERS=['baiyangj','chendand','yuekez','zhoux','sunmingy'];
const DEFAULT_CAMPUSES=[
  {id:'mabao',name:'顺义马坡',code:'mabao'},
  {id:'shilipu',name:'朝阳十里堡',code:'shilipu'},
  {id:'guowang',name:'朝阳国网',code:'guowang'},
  {id:'langang',name:'朝阳蓝色港湾',code:'langang'},
  {id:'chaojun',name:'朝珺私教',code:'chaojun'}
];
async function bootstrapDefaultUsers(){
  if(!ENABLE_DEFAULT_USER_BOOTSTRAP)return;
  if(!DEFAULT_ADMIN_BOOTSTRAP_PASSWORD)throw new Error('ENABLE_DEFAULT_USER_BOOTSTRAP=true 时必须配置 DEFAULT_ADMIN_BOOTSTRAP_PASSWORD');
  const us=[{id:'admin',name:'管理员',role:'admin',username:'admin'},{id:'baiyangj',name:'白杨静',role:'editor',username:'baiyangj'},{id:'chendand',name:'陈丹丹',role:'editor',username:'chendand'},{id:'yuekez',name:'岳克舟',role:'editor',username:'yuekez'},{id:'zhoux',name:'周欣',role:'editor',username:'zhoux'},{id:'sunmingy',name:'孙明玥',role:'editor',username:'sunmingy'}];
  const h=await bcrypt.hash(DEFAULT_ADMIN_BOOTSTRAP_PASSWORD,10);
  for(const u of us){
    const ex=await get(T_USERS,u.id).catch(()=>null);
    if(!ex)await put(T_USERS,u.id,{...u,password:h,createdAt:new Date().toISOString()});
  }
}
async function ensureCoachBindings(){
  for(const id of DEFAULT_COACH_USERS){
    const u=await get(T_USERS,id).catch(()=>null);
    if(!u)continue;
    if(u.role==='editor'&&(!u.coachName||!String(u.coachName).trim())){
      await put(T_USERS,id,{...u,coachName:u.name||id,coachId:u.coachId||id,updatedAt:new Date().toISOString()});
    }
  }
}
async function ensureDefaultCampuses(){
  await mkTable(T_CAMPUSES);
  for(const campus of DEFAULT_CAMPUSES){
    const ex=await get(T_CAMPUSES,campus.id).catch(()=>null);
    if(!ex)await put(T_CAMPUSES,campus.id,{...campus,createdAt:new Date().toISOString()});
  }
}
async function putSeedRows(table,rows=[]){
  const chunkSize=20;
  for(let i=0;i<rows.length;i+=chunkSize){
    await Promise.all(rows.slice(i,i+chunkSize).map(row=>put(table,row.id,row)));
  }
}
function isMabaoFinanceSeedRow(row){
  return String(row?.seedTag||'').startsWith('mabao-finance-seed-');
}
function importedLedgerMonthKey(row){
  const sourceMonth=String(row?.sourceMonth||'').trim();
  if(sourceMonth)return sourceMonth;
  if(row?.scheduleId||Number(row?.lessonDelta)>=0)return '';
  const reason=String(row?.reason||'').trim();
  const match=reason.match(/^历史导入\s*(\d{1,2})月消课$/);
  if(!match)return '';
  const year=String(row?.relatedDate||row?.createdAt||'').slice(0,4);
  if(!/^\d{4}$/.test(year))return '';
  return `${year}-${String(match[1]).padStart(2,'0')}`;
}
function isImportedMonthlyLedgerRow(row){
  return !!importedLedgerMonthKey(row);
}
function importedLedgerDuplicateKey(row){
  const monthKey=importedLedgerMonthKey(row);
  if(!monthKey)return '';
  return [
    row.entitlementId,
    row.purchaseId,
    row.reason||'',
    monthKey
  ].join('|');
}
function isCurrentImportedLedgerRow(row){
  return !!(importedLedgerMonthKey(row)&&String(row?.sourceMonth||'').trim()&&isMabaoFinanceSeedRow(row)&&String(row?.studentId||'').trim());
}
function importedLedgerExactKey(row){
  const monthKey=importedLedgerMonthKey(row);
  if(!monthKey)return '';
  return [
    row.entitlementId,
    row.purchaseId,
    row.studentId,
    Number(row.lessonDelta)||0,
    row.action||'',
    row.reason||'',
    monthKey,
    row.sourceSheet||'',
    row.notes||''
  ].join('|');
}
function importedLedgerRowScore(row){
  return [
    String(row?.sourceMonth||'').trim()?1:0,
    isMabaoFinanceSeedRow(row)?1:0,
    String(row?.relatedDate||''),
    String(row?.createdAt||'')
  ];
}
function compareImportedLedgerRowScore(a,b){
  const as=importedLedgerRowScore(a),bs=importedLedgerRowScore(b);
  for(let i=0;i<as.length;i++){
    if(as[i]===bs[i])continue;
    return as[i]>bs[i]?1:-1;
  }
  return 0;
}
function collectDuplicateImportedLedgerIds(existingRows=[]){
  const grouped=new Map();
  const removeIds=[];
  (existingRows||[]).forEach(row=>{
    const key=importedLedgerDuplicateKey(row);
    if(!key)return;
    const list=grouped.get(key)||[];
    list.push(row);
    grouped.set(key,list);
  });
  grouped.forEach(list=>{
    const currentRows=list.filter(isCurrentImportedLedgerRow);
    const candidates=currentRows.length?currentRows:list;
    const currentIds=new Set(candidates.map(row=>row.id));
    list.forEach(row=>{if(!currentIds.has(row.id))removeIds.push(row.id);});
    const keepers=new Map();
    candidates.forEach(row=>{
      const key=importedLedgerExactKey(row)||importedLedgerDuplicateKey(row);
      const current=keepers.get(key);
      if(!current){
        keepers.set(key,row);
        return;
      }
      if(compareImportedLedgerRowScore(row,current)>0){
        removeIds.push(current.id);
        keepers.set(key,row);
        return;
      }
      removeIds.push(row.id);
    });
  });
  return [...new Set(removeIds.filter(Boolean))];
}
function filterImportedLedgerRowsForView(rows=[]){
  const grouped=new Map();
  const passthrough=[];
  for(const row of rows||[]){
    const key=importedLedgerDuplicateKey(row);
    if(!key){
      passthrough.push(row);
      continue;
    }
    const list=grouped.get(key)||[];
    list.push(row);
    grouped.set(key,list);
  }
  const filtered=[...passthrough];
  grouped.forEach(list=>{
    const currentRows=list.filter(isCurrentImportedLedgerRow);
    filtered.push(...(currentRows.length?currentRows:list));
  });
  return filtered;
}
function normalizeEntitlementLedgerRowsForView(rows=[]){
  const deduped=[];
  const seen=new Set();
  for(const row of filterImportedLedgerRowsForView(rows)||[]){
    const monthKey=importedLedgerMonthKey(row);
    const key=monthKey
      ? [
          row.entitlementId,
          row.purchaseId,
          row.studentId,
          Number(row.lessonDelta)||0,
          row.action||'',
          row.reason||'',
          monthKey,
          row.sourceSheet||'',
          row.notes||''
        ].join('|')
      : [
          row.entitlementId,
          row.purchaseId,
          row.studentId,
          row.scheduleId||'',
          Number(row.lessonDelta)||0,
          row.action||'',
          row.reason||'',
          row.relatedDate||'',
          row.sourceMonth||'',
          row.sourceSheet||'',
          row.notes||''
        ].join('|');
    if(seen.has(key))continue;
    seen.add(key);
    deduped.push(row);
  }
  const monthlyMap=new Map();
  const result=[];
  for(const row of deduped){
    const monthKey=importedLedgerMonthKey(row);
    if(!monthKey){
      result.push(row);
      continue;
    }
    const key=[row.entitlementId,row.purchaseId,row.studentId,row.reason||'',monthKey].join('|');
    const current=monthlyMap.get(key);
    if(!current){
      monthlyMap.set(key,{...row,sourceMonth:row.sourceMonth||monthKey});
      continue;
    }
    monthlyMap.set(key,{
      ...current,
      lessonDelta:(Number(current.lessonDelta)||0)+(Number(row.lessonDelta)||0),
      relatedDate:String(row.relatedDate||'')>String(current.relatedDate||'')?row.relatedDate:current.relatedDate,
      createdAt:String(row.createdAt||'')>String(current.createdAt||'')?row.createdAt:current.createdAt,
      sourceMonth:current.sourceMonth||monthKey
    });
  }
  return [...result,...monthlyMap.values()];
}
function collectMabaoSeedStaleRowIds(existingRows=[],seedRows=[],tag=''){
  const nextIds=new Set((seedRows||[]).map(row=>row.id));
  return (existingRows||[])
    .filter(row=>isMabaoFinanceSeedRow(row)&&(!nextIds.has(row.id)||String(row.seedTag||'')!==String(tag||'')))
    .map(row=>row.id);
}
function collectMabaoSeedImportedLedgerReplacementIds(existingRows=[],seedRows=[]){
  const seedKeys=new Set((seedRows||[]).map(row=>{
    const monthKey=importedLedgerMonthKey(row);
    if(!monthKey)return '';
    return [row.entitlementId,row.purchaseId,row.studentId,monthKey].join('|');
  }).filter(Boolean));
  if(!seedKeys.size)return [];
  return (existingRows||[])
    .filter(row=>!isMabaoFinanceSeedRow(row)&&isImportedMonthlyLedgerRow(row))
    .filter(row=>seedKeys.has([row.entitlementId,row.purchaseId,row.studentId,importedLedgerMonthKey(row)].join('|')))
    .map(row=>row.id);
}
async function replaceMabaoSeedRows(table,seedRows=[],tag=''){
  const staleIds=collectMabaoSeedStaleRowIds(await scan(table).catch(()=>[]),seedRows,tag);
  if(staleIds.length)await deleteSeedRows(table,staleIds);
  await putSeedRows(table,seedRows);
}
async function replaceMabaoSeedLedgerRows(seedRows=[],tag=''){
  const existingRows=await scan(T_ENTITLEMENT_LEDGER).catch(()=>[]);
  const staleIds=collectMabaoSeedStaleRowIds(existingRows,seedRows,tag);
  const replacementIds=collectMabaoSeedImportedLedgerReplacementIds(existingRows,seedRows);
  const duplicateIds=collectDuplicateImportedLedgerIds(existingRows);
  const removeIds=[...new Set([...staleIds,...replacementIds,...duplicateIds])];
  if(removeIds.length)await deleteSeedRows(T_ENTITLEMENT_LEDGER,removeIds);
  await putSeedRows(T_ENTITLEMENT_LEDGER,seedRows);
}
async function repairImportedLedgerDuplicates(){
  const existingRows=await scan(T_ENTITLEMENT_LEDGER).catch(()=>[]);
  const duplicateIds=collectDuplicateImportedLedgerIds(existingRows);
  if(!duplicateIds.length)return 0;
  await deleteSeedRows(T_ENTITLEMENT_LEDGER,duplicateIds);
  return duplicateIds.length;
}
async function maybeRepairImportedLedgerDuplicates(){
  if(importedLedgerRepairChecked)return 0;
  importedLedgerRepairChecked=true;
  try{
    return await repairImportedLedgerDuplicates();
  }catch(err){
    importedLedgerRepairChecked=false;
    throw err;
  }
}
function hasCurrentMabaoSeedRows(existingRows=[],seedRows=[],tag=''){
  const seedIds=new Set((seedRows||[]).map(row=>row.id));
  const existingSeedRows=(existingRows||[]).filter(isMabaoFinanceSeedRow);
  return existingSeedRows.length===seedRows.length&&existingSeedRows.every(row=>seedIds.has(row.id)&&String(row.seedTag||'')===String(tag||''));
}
async function deleteSeedRows(table,ids=[]){
  const chunkSize=20;
  for(let i=0;i<ids.length;i+=chunkSize){
    await Promise.all(ids.slice(i,i+chunkSize).map(id=>del(table,id).catch(()=>null)));
  }
}
async function isMabaoFinanceSeedCurrent(){
  const tag=mabaoFinanceSeed?.meta?.tag;
  if(!tag)return false;
  const [purchases,entitlements,ledger]=await Promise.all([
    scan(T_PURCHASES).catch(()=>[]),
    scan(T_ENTITLEMENTS).catch(()=>[]),
    scan(T_ENTITLEMENT_LEDGER).catch(()=>[])
  ]);
  if(!hasCurrentMabaoSeedRows(purchases,mabaoFinanceSeed.purchases,tag))return false;
  if(!hasCurrentMabaoSeedRows(entitlements,mabaoFinanceSeed.entitlements,tag))return false;
  if(!hasCurrentMabaoSeedRows(ledger,mabaoFinanceSeed.entitlementLedger,tag))return false;
  if(collectMabaoSeedImportedLedgerReplacementIds(ledger,mabaoFinanceSeed.entitlementLedger).length)return false;
  for(const id of mabaoFinanceSeed?.meta?.deletePurchases||[]){
    const old=await get(T_PURCHASES,id).catch(()=>null);
    if(old)return false;
  }
  return true;
}
async function bootstrapMabaoFinanceSeed(){
  if(!ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP)return;
  if(await isMabaoFinanceSeedCurrent())return;
  const tag=mabaoFinanceSeed?.meta?.tag||'';
  await deleteSeedRows(T_PURCHASES,mabaoFinanceSeed?.meta?.deletePurchases||[]);
  await deleteSeedRows(T_PACKAGES,mabaoFinanceSeed?.meta?.deletePackages||[]);
  await replaceMabaoSeedRows(T_STUDENTS,mabaoFinanceSeed.students,tag);
  await replaceMabaoSeedRows(T_PRODUCTS,mabaoFinanceSeed.products,tag);
  await replaceMabaoSeedRows(T_PACKAGES,mabaoFinanceSeed.packages,tag);
  await replaceMabaoSeedRows(T_PURCHASES,mabaoFinanceSeed.purchases,tag);
  await replaceMabaoSeedRows(T_ENTITLEMENTS,mabaoFinanceSeed.entitlements,tag);
  await replaceMabaoSeedLedgerRows(mabaoFinanceSeed.entitlementLedger,tag);
}
async function listCampusesWithDefaults(){
  const rows=await getCachedScan(T_CAMPUSES).catch(()=>[]);
  return rows.length?rows:DEFAULT_CAMPUSES;
}
function scheduleInitInBackground(){
  if(REQUIRED_ENV_VARS.some((k)=>!process.env[k]))return;
  if(inited||initPromise)return;
  init().catch(err=>console.error('[api-init] background init failed',err));
}
async function init(){
  if(inited)return;
  if(initPromise)return initPromise;
  initPromise=(async()=>{
    const startedAt=Date.now();
    const missing=REQUIRED_ENV_VARS.filter((k)=>!process.env[k]);
    if(missing.length)throw new Error('缺少环境变量：'+missing.join(', '));
    if(ENABLE_RUNTIME_TABLE_ENSURE||ENABLE_TABLE_BOOTSTRAP){
      const stepStartedAt=Date.now();
      for(const t of RUNTIME_ENSURED_TABLES)await mkTable(t);
      console.log(`[api-init] ensure runtime tables done ${Date.now()-stepStartedAt}ms (total ${Date.now()-startedAt}ms)`);
    }
    if(ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP){
      const stepStartedAt=Date.now();
      for(const t of [T_STUDENTS,T_PRODUCTS,T_PACKAGES,T_PURCHASES,T_ENTITLEMENTS,T_ENTITLEMENT_LEDGER])await mkTable(t);
      console.log(`[api-init] ensure mabao seed tables done ${Date.now()-stepStartedAt}ms (total ${Date.now()-startedAt}ms)`);
    }
    if(ENABLE_TABLE_BOOTSTRAP){
      let stepStartedAt=Date.now();
      for(const t of[T_USERS,T_COURTS,T_STUDENTS,T_PRODUCTS,T_PLANS,T_SCHEDULE,T_COACHES,T_CLASSES,T_CLASS_NOS,T_CAMPUSES,T_FEEDBACKS,T_PACKAGES,T_PURCHASES,T_ENTITLEMENTS,T_ENTITLEMENT_LEDGER,T_PRICE_PLANS])await mkTable(t);
      console.log(`[api-init] ensure bootstrap tables done ${Date.now()-stepStartedAt}ms (total ${Date.now()-startedAt}ms)`);
      stepStartedAt=Date.now();
      await bootstrapDefaultUsers();
      console.log(`[api-init] bootstrapDefaultUsers done ${Date.now()-stepStartedAt}ms (total ${Date.now()-startedAt}ms)`);
      stepStartedAt=Date.now();
      await ensureDefaultCampuses();
      console.log(`[api-init] ensureDefaultCampuses done ${Date.now()-stepStartedAt}ms (total ${Date.now()-startedAt}ms)`);
      stepStartedAt=Date.now();
      await ensureCoachBindings();
      console.log(`[api-init] ensureCoachBindings done ${Date.now()-stepStartedAt}ms (total ${Date.now()-startedAt}ms)`);
    }
    if(ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP){
      const stepStartedAt=Date.now();
      await bootstrapMabaoFinanceSeed();
      console.log(`[api-init] bootstrapMabaoFinanceSeed done ${Date.now()-stepStartedAt}ms (total ${Date.now()-startedAt}ms)`);
    }
    {
      const stepStartedAt=Date.now();
      const repairedCount=await repairImportedLedgerDuplicates();
      console.log(`[api-init] repairImportedLedgerDuplicates done ${Date.now()-stepStartedAt}ms, removed ${repairedCount} rows (total ${Date.now()-startedAt}ms)`);
    }
    inited=true;
    if(ENABLE_DEFAULT_PRICE_PLAN_BOOTSTRAP){
      const stepStartedAt=Date.now();
      await syncDefaultPricePlans().catch(err=>console.error('[api-bootstrap] sync default price plans failed',err));
      console.log(`[api-init] syncDefaultPricePlans done ${Date.now()-stepStartedAt}ms (total ${Date.now()-startedAt}ms)`);
    }else if(!defaultPricePlanSyncStarted){
      defaultPricePlanSyncStarted=true;
      Promise.resolve().then(()=>syncDefaultPricePlans()).catch(err=>console.error('[api-bootstrap] sync default price plans failed',err));
    }
    {
      const stepStartedAt=Date.now();
      prewarmHotScanCache().catch(err=>console.error('[api-timing] prewarm hot tables failed',err));
      console.log(`[api-init] prewarmHotScanCache dispatched ${Date.now()-stepStartedAt}ms (total ${Date.now()-startedAt}ms)`);
    }
    console.log(`[api-timing] init cold start ${Date.now()-startedAt}ms`);
  })().catch(err=>{
    initPromise=null;
    inited=false;
    throw err;
  });
  return initPromise;
}

scheduleInitInBackground();

function sendJson(res,body,code=200){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
  res.status(code).json(body);
}
function authUser(req){const token=(req.headers.authorization||'').replace('Bearer ','');if(!token)return null;try{return jwt.verify(token,JWT_SECRET);}catch{return null;}}
function requireAdminUser(user){
  if(user?.type==='match_user')throw new Error('无管理端权限');
  if(!user?.id)throw new Error('未登录');
  return user;
}
function parsePermissionList(value){
  if(Array.isArray(value))return value.map(x=>String(x||'').trim()).filter(Boolean);
  return String(value||'').split(/[,，\s]+/).map(x=>x.trim()).filter(Boolean);
}
function userMatchPermissions(user){
  const permissions=new Set(parsePermissionList(user?.permissions||user?.matchPermissions));
  if(user?.role==='admin')permissions.add('match_ops'),permissions.add('match_finance');
  if(String(user?.name||'').trim()==='陈丹丹')permissions.add('match_ops'),permissions.add('match_finance');
  if(user?.matchOps)permissions.add('match_ops');
  if(user?.matchFinance)permissions.add('match_finance');
  return [...permissions].filter(x=>['match_ops','match_finance'].includes(x));
}
function requireMatchAdminPermission(user,permission){
  requireAdminUser(user);
  const permissions=userMatchPermissions(user);
  if(permissions.includes(permission))return true;
  throw new Error(permission==='match_finance'?'无约球财务权限':'无约球运营权限');
}
function requireMatchUser(req){
  const user=authUser(req);
  if(!user||user.type!=='match_user')throw new Error('未登录');
  return user;
}
async function canMatchUserCreate(userId){
  const pool=getMatchSqlPool();
  const [createdRes,userRes]=await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM match_posts WHERE creatorUserId=$1',[userId]),
    pool.query('SELECT * FROM match_users WHERE id=$1',[userId])
  ]);
  const createdCount=Number(createdRes.rows[0]?.count||0);
  if(createdCount>0)return true;
  const user=userRes.rows[0]||{};
  const phone=normalizePhone(user.phone||'');
  if(!phone)return false;
  const adminUser=await getCachedRow(T_USERS,phone).catch(()=>null);
  if(!adminUser)return false;
  const permissions=userMatchPermissions(adminUser);
  return adminUser.role==='admin'||permissions.includes('match_ops');
}
function buildMatchUserToken(user){
  return jwt.sign({id:user.id,type:'match_user',openid:user.openid},JWT_SECRET,{expiresIn:'7d'});
}
function assertMatchPostInput(input){
  const title=String(input.title||'').trim();
  if(!title)throw new Error('请填写标题');
  const matchType=normalizeMatchType(input.matchType);
  if(!['single','double'].includes(matchType))throw new Error('请选择约球类型');
  const targetHeadcount=parseInt(input.targetHeadcount,10);
  if(!Number.isInteger(targetHeadcount)||targetHeadcount<2)throw new Error('请填写有效人数');
  const rawNtrpMin=String(input.ntrpMin??'').trim();
  const rawNtrpMax=String(input.ntrpMax??'').trim();
  const hasPresetLevel=rawNtrpMin!==''||rawNtrpMax!=='';
  const ntrpMin=hasPresetLevel?Number(rawNtrpMin):0;
  const ntrpMax=hasPresetLevel?Number(rawNtrpMax):0;
  if(hasPresetLevel&&(!isValidNtrp(ntrpMin)||!isValidNtrp(ntrpMax)||ntrpMin>ntrpMax))throw new Error('NTRP 范围不正确');
  if(!hasPresetLevel&&(rawNtrpMin!==rawNtrpMax))throw new Error('NTRP 范围不正确');
  if(!['不限','男生','女生'].includes(input.genderPreference))throw new Error('请选择性别偏好');
  const estimatedCourtFee=normalizeMoney(input.estimatedCourtFee);
  if(estimatedCourtFee<=0)throw new Error('费用必须大于 0');
  const venueName=String(input.venueName||'').trim();
  if(!venueName)throw new Error('请选择球场');
  const startMs=dateMs(input.startTime);
  const endMs=dateMs(input.endTime);
  if(!Number.isFinite(startMs))throw new Error('请选择开始时间');
  if(!Number.isFinite(endMs)||endMs<=startMs)throw new Error('结束时间必须晚于开始时间');
  if(String(input.startTime||'').slice(0,10)!==String(input.endTime||'').slice(0,10))throw new Error('不能跨天');
  return {...input,title,matchType,targetHeadcount,ntrpMin,ntrpMax,levelMode:hasPresetLevel?'preset':'first_join',estimatedCourtFee,venueName,status:input.status||'open'};
}
function normalizeMatchType(value){
  const raw=String(value||'').trim();
  if(raw==='单打')return 'single';
  if(raw==='双打')return 'double';
  return raw;
}
function maskPhone(value=''){
  const phone=normalizePhone(value);
  if(!/^1\d{10}$/.test(phone))return '';
  return `${phone.slice(0,3)}****${phone.slice(-4)}`;
}
function isValidNtrp(value){
  return Number.isFinite(value)&&value>=1&&value<=5&&Math.abs(value*2-Math.round(value*2))<0.001;
}
function formatNtrpValue(value){
  const num=Number(value);
  if(!isValidNtrp(num))return '';
  return num.toFixed(1);
}
function formatNtrpRangeText(minValue,maxValue){
  const min=formatNtrpValue(minValue);
  const max=formatNtrpValue(maxValue);
  if(min&&max)return min===max?min:`${min}-${max}`;
  return min||max||'待首位报名定级';
}
function activeMatchRegistrations(registrations=[]){
  return (registrations||[]).filter(row=>String(row.registrationstatus||row.registrationStatus)==='registered');
}
function activeRegistrationLevels(registrations=[]){
  return activeMatchRegistrations(registrations)
    .map(row=>Number(row.ntrplevel||row.ntrpLevel||0))
    .filter(isValidNtrp)
    .sort((a,b)=>a-b);
}
function resolveEffectiveLevelRange(row,registrations=[]){
  const levels=activeRegistrationLevels(registrations);
  if(levels.length>0)return {min:levels[0],max:levels[levels.length-1],pending:false};
  const min=Number(row.ntrpmin||row.ntrpMin||0);
  const max=Number(row.ntrpmax||row.ntrpMax||0);
  if(isValidNtrp(min)&&isValidNtrp(max))return {min,max,pending:false};
  return {min:0,max:0,pending:true};
}
function matchTimelineStatus(match,now=new Date()){
  const status=String(match?.status||'open');
  if(status==='cancelled')return '已取消';
  const nowMs=now instanceof Date?now.getTime():dateMs(now);
  const startMs=dateMs(match.startTime||match.starttime);
  const endMs=dateMs(match.endTime||match.endtime);
  if(Number.isFinite(endMs)&&nowMs>=endMs)return '已结束';
  if(Number.isFinite(startMs)&&nowMs<startMs)return '待开始';
  return '进行中';
}
function deriveMatchStatus(match,now=new Date()){
  const status=String(match?.status||'open');
  if(['cancelled','settled','fee_pending'].includes(status))return status;
  const nowMs=now instanceof Date?now.getTime():dateMs(now);
  const startTime=match.startTime||match.starttime;
  const endTime=match.endTime||match.endtime;
  if(status==='booked'){
    if(Number.isFinite(dateMs(endTime))&&nowMs>=dateMs(endTime))return 'attendance_pending';
    if(Number.isFinite(dateMs(startTime))&&nowMs>=dateMs(startTime))return 'playing';
  }
  return status;
}
function matchDurationHours(startTime,endTime){
  const startMs=dateMs(startTime);
  const endMs=dateMs(endTime);
  if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||endMs<=startMs)return 0;
  return (endMs-startMs)/(60*60*1000);
}
function isFourPlayerGroupMatch(match){
  return Number(match?.targetheadcount||match?.targetHeadcount||0)===4;
}
function computeMatchSettlementAmount({matchType,startTime,endTime,finalCourtFee,participantCount}={}){
  const base=Math.round(normalizeMoney(finalCourtFee));
  const count=Number(participantCount||0);
  if(count<=1)throw new Error('1人默认取消，不能生成AA');
  let surcharge=0;
  if(normalizeMatchType(matchType)==='single'&&count===2&&matchDurationHours(startTime,endTime)>=1.99)surcharge=60;
  return base+surcharge;
}
function buildPreviewAaText({matchType,startTime,endTime,estimatedCourtFee=0,finalCourtFee=0,activeCount=0,targetHeadcount=0}={}){
  const currentCount=Number(activeCount||0);
  const previewCount=currentCount>1?currentCount:(currentCount===0?Number(targetHeadcount||0):0);
  const finalFee=normalizeMoney(finalCourtFee);
  const estimatedFee=normalizeMoney(estimatedCourtFee);
  if(previewCount>1&&finalFee>0){
    const total=computeMatchSettlementAmount({matchType,startTime,endTime,finalCourtFee:finalFee,participantCount:previewCount});
    return `约 ¥${Math.ceil(total/previewCount)}/人`;
  }
  if(previewCount>1&&estimatedFee>0){
    const total=computeMatchSettlementAmount({matchType,startTime,endTime,finalCourtFee:estimatedFee,participantCount:previewCount});
    return `约 ¥${Math.ceil(total/previewCount)}/人`;
  }
  if(currentCount===1)return '待成团';
  return 'AA待定';
}
function splitAaFee(finalCourtFee,participantIds){
  const total=Math.round(normalizeMoney(finalCourtFee));
  const ids=[...new Set((participantIds||[]).filter(Boolean).map(String))];
  if(total<=0)throw new Error('最终费用必须大于 0');
  if(ids.length<=0)throw new Error('没有可计费参与人');
  const each=Math.ceil(total/ids.length);
  return ids.map((userId,index)=>{
    const amount=index===ids.length-1?total-each*(ids.length-1):each;
    return {userId,amount};
  });
}
async function withMatchSqlTransaction(fn){
  const client=await getMatchSqlPool().connect();
  try{
    await client.query('BEGIN');
    const result=await fn(client);
    await client.query('COMMIT');
    return result;
  }catch(err){
    await client.query('ROLLBACK').catch(()=>null);
    throw err;
  }finally{
    client.release();
  }
}
async function registerMatchUser(matchId,userId){
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    const status=deriveMatchStatus(match);
    if(!['open','full'].includes(status))throw new Error('当前状态不能报名');
    if(dateMs(match.starttime||match.startTime)<=Date.now())throw new Error('已开始，不能报名');
    const [dup,activeRegsRes,userRes]=await Promise.all([
      client.query("SELECT id FROM match_registrations WHERE matchId=$1 AND userId=$2 AND registrationStatus='registered'",[matchId,userId]),
      client.query("SELECT r.*,u.ntrpLevel FROM match_registrations r LEFT JOIN match_users u ON u.id=r.userId WHERE r.matchId=$1 AND r.registrationStatus='registered' ORDER BY r.createdAt ASC",[matchId]),
      client.query('SELECT * FROM match_users WHERE id=$1',[userId])
    ]);
    if(dup.rowCount>0)throw new Error('已报名');
    const user=userRes.rows[0];
    if(!user)throw new Error('用户不存在');
    const userNtrp=Number(user.ntrplevel||user.ntrpLevel||0);
    if(!isValidNtrp(userNtrp))throw new Error('请先在“我的”页面设置真实水平');
    const activeRegs=activeRegsRes.rows;
    const count=activeRegs.length;
    if(count>=Number(match.targetheadcount||match.targetHeadcount))throw new Error('名额已满');
    const currentMin=Number(match.ntrpmin||match.ntrpMin||0);
    const levelMode=String(match.levelmode||match.levelMode||'preset');
    if(levelMode==='first_join'&&count===0&&currentMin<=0){
      await client.query('UPDATE match_posts SET ntrpMin=$1,ntrpMax=$1,updatedAt=NOW() WHERE id=$2',[userNtrp,matchId]);
    }else if(isValidNtrp(currentMin)&&userNtrp<currentMin){
      throw new Error(`本局最低水平为 ${currentMin.toFixed(1)}`);
    }
    const id=uuidv4();
    await client.query("INSERT INTO match_registrations(id,matchId,userId,registrationStatus,createdAt) VALUES($1,$2,$3,'registered',NOW())",[id,matchId,userId]);
    const nextCount=count+1;
    const nextStatus=nextCount>=Number(match.targetheadcount||match.targetHeadcount)?'full':'open';
    let formationStatus=String(match.formationstatus||match.formationStatus||'free_open');
    let justFormedGroup=false;
    if(isFourPlayerGroupMatch(match)&&nextCount>=4){
      const prepayDeadlineAt=new Date(Date.now()+MATCH_PREPAY_WINDOW_HOURS*60*60*1000).toISOString();
      const participantIds=[...activeRegs.map(row=>String(row.userid||row.userId)),String(userId)];
      const existingFeeRes=await client.query('SELECT * FROM match_fee_records WHERE matchId=$1 LIMIT 1',[matchId]);
      if(existingFeeRes.rowCount<=0){
        const ledger=buildGroupPrepayLedger({matchId,estimatedCourtFee:match.estimatedcourtfee||match.estimatedCourtFee,participantIds});
        await client.query(
          'INSERT INTO match_fee_records(id,matchId,estimatedCourtFee,finalCourtFee,participantCount,aaAmount,roundingRule,roundingDifference,status,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())',
          [ledger.record.id,matchId,ledger.record.estimatedCourtFee,ledger.record.finalCourtFee,ledger.record.participantCount,ledger.record.aaAmount,ledger.record.roundingRule,ledger.record.roundingDifference,ledger.record.status]
        );
        for(const split of ledger.splits){
          await client.query('INSERT INTO match_fee_splits(id,matchId,userId,amount,payStatus,paidAmount,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,NOW(),NOW())',[split.id,matchId,split.userId,split.amount,split.payStatus,split.paidAmount]);
        }
        justFormedGroup=true;
      }
      formationStatus='group_ready';
      await client.query('UPDATE match_posts SET status=$1,formationStatus=$2,prepayTriggeredAt=NOW(),prepayDeadlineAt=$3,updatedAt=NOW() WHERE id=$4',[nextStatus,formationStatus,prepayDeadlineAt,matchId]);
    }else{
      await client.query('UPDATE match_posts SET status=$1,formationStatus=$2,updatedAt=NOW() WHERE id=$3',[nextStatus,formationStatus,matchId]);
    }
    return {
      id,
      currentHeadcount:nextCount,
      status:nextStatus,
      formationStatus,
      justFormedGroup,
      formationNotice:justFormedGroup?'本局已成团，需在2小时内完成预付；全员付款成功后约球生效':''};
  });
}
function toMatchView(row,registrations=[],viewerId='',feeSplits=[]){
  const active=(registrations||[]).filter(r=>String(r.registrationstatus||r.registrationStatus)==='registered');
  const viewerRegistration=(registrations||[]).find(r=>String(r.userid||r.userId)===String(viewerId));
  const finalFee=normalizeMoney(row.finalcourtfee||row.finalCourtFee);
  const activeCount=active.length;
  const viewerFeeSplit=(feeSplits||[]).find(row=>String(row.userid||row.userId)===String(viewerId))||null;
  const levelRange=resolveEffectiveLevelRange(row,active);
  const formationStatus=String(row.formationstatus||row.formationStatus||'free_open');
  const canSelfCancel=Boolean(viewerRegistration&&String(viewerRegistration.registrationstatus||viewerRegistration.registrationStatus)==='registered'&&formationStatus!=='group_locked');
  const derivedStatus=deriveMatchStatus(row);
  const statusText=formationStatus==='group_ready'?'待预付':formationStatus==='group_locked'?'已成团':matchStatusText(derivedStatus);
  return {
    id:row.id,
    creatorUserId:row.creatoruserid||row.creatorUserId,
    title:row.title,
    matchType:row.matchtype||row.matchType,
    targetHeadcount:Number(row.targetheadcount||row.targetHeadcount||0),
    currentHeadcount:activeCount,
    startTime:row.starttime||row.startTime,
    endTime:row.endtime||row.endTime,
    venueName:row.venuename||row.venueName||'',
    venueAddress:row.venueaddress||row.venueAddress||'',
    ntrpMin:levelRange.min,
    ntrpMax:levelRange.max,
    ntrpRangeText:formatNtrpRangeText(levelRange.min,levelRange.max),
    levelMode:row.levelmode||row.levelMode||'preset',
    genderPreference:row.genderpreference||row.genderPreference||'不限',
    estimatedCourtFee:normalizeMoney(row.estimatedcourtfee||row.estimatedCourtFee),
    finalCourtFee:finalFee,
    status:derivedStatus,
    statusText,
    timelineStatusText:matchTimelineStatus(row),
    formationStatus,
    prepayDeadlineAt:row.prepaydeadlineat||row.prepayDeadlineAt||'',
    statusHintText:buildMatchStatusHint({match:row,registrations:active,viewerId,viewerJoined:Boolean(viewerRegistration)}),
    viewerJoined:!!viewerRegistration&&String(viewerRegistration.registrationstatus||viewerRegistration.registrationStatus)==='registered',
    viewerIsCreator:String(row.creatoruserid||row.creatorUserId)===String(viewerId),
    viewerRegistrationStatus:viewerRegistration?.registrationstatus||viewerRegistration?.registrationStatus||'',
    aaDisplayText:buildPreviewAaText({matchType:row.matchtype||row.matchType,startTime:row.starttime||row.startTime,endTime:row.endtime||row.endTime,estimatedCourtFee:row.estimatedcourtfee||row.estimatedCourtFee,finalCourtFee:finalFee,activeCount,targetHeadcount:row.targetheadcount||row.targetHeadcount}),
    viewerFeeSplit,
    offlinePaymentText:viewerFeeSplit&&String(viewerFeeSplit.paystatus||viewerFeeSplit.payStatus)==='pending'?'请线下联系运营收款，付款后由管理端确认':'',
    canSelfCancel,
    registrations:active.map(reg=>({
      ...reg,
      userName:String(reg.nickname||reg.nickName||maskPhone(reg.phone)||reg.userid||reg.userId||'球友').trim(),
      ntrpText:formatNtrpValue(reg.ntrplevel||reg.ntrpLevel)||'未设水平',
      attendanceRateText:reg.attendanceratetext||reg.attendanceRateText||'暂无守约率',
      finalAttendanceStatus:reg.finalattendancestatus||reg.finalAttendanceStatus||'pending'
    }))
  };
}
function toMatchDetailResponse(view){
  if(!view)return null;
  const registrations=Array.isArray(view.registrations)?view.registrations:[];
  const match={...view};
  delete match.registrations;
  return {...view,match,registrations};
}
function matchStatusText(status){
  return ({open:'招募中',full:'已满员',booked:'已订场',playing:'进行中',attendance_pending:'待确认到场',fee_pending:'待确认费用',settled:'已结清',cancelled:'已取消'})[status]||status;
}
function assertMatchBookingInput(input){
  const finalCourtFee=normalizeMoney(input.finalCourtFee);
  if(finalCourtFee<=0)throw new Error('请填写最终场地费');
  const bookingStatus=input.bookingStatus||'booked';
  if(!['booked','cancelled'].includes(bookingStatus))throw new Error('订场状态不正确');
  return {...input,finalCourtFee,bookingStatus};
}
function assertBookedWithdrawalInput(input={}){
  const financialResponsibility=String(input.financialResponsibility||'').trim();
  if(!['charge','waive','abnormal'].includes(financialResponsibility))throw new Error('退赛责任不正确');
  const reason=String(input.reason||input.withdrawalReason||'').trim();
  return {financialResponsibility,reason};
}
function assertMatchFeeSplitUpdateInput(input={}){
  const payStatus=String(input.payStatus||'paid').trim();
  if(!['pending','paid','waived','refunded','bad_debt','abnormal'].includes(payStatus))throw new Error('收款状态不正确');
  const note=String(input.note||'').trim();
  const amount=input.amount==null?null:normalizeMoney(input.amount);
  if(amount!=null&&amount<0)throw new Error('AA金额不能小于 0');
  if((['waived','refunded','bad_debt','abnormal'].includes(payStatus)||amount!=null)&&!note)throw new Error('请填写原因');
  const paidAmount=input.paidAmount==null?null:normalizeMoney(input.paidAmount);
  return {payStatus,paidAmount,amount,note};
}
function assertMatchReplacementTransferInput(input={}){
  const fromUserId=String(input.fromUserId||'').trim();
  if(!fromUserId)throw new Error('请选择原报名人');
  const replacementPhone=assertPhone(input.replacementPhone||input.phone||'');
  const replacementPayStatus=String(input.replacementPayStatus||'paid').trim();
  if(!['pending','paid'].includes(replacementPayStatus))throw new Error('替补付款状态不正确');
  const refundNote=String(input.refundNote||input.note||'').trim();
  if(!refundNote)throw new Error('请填写转让说明');
  return {
    fromUserId,
    replacementPhone,
    replacementPayStatus,
    refundNote,
    transferNote:String(input.transferNote||'').trim()
  };
}
function resolveFinalAttendanceStatus(row){
  if(row?.creatorStatus==='attended'||row?.creatorstatus==='attended')return 'attended';
  if(row?.creatorStatus==='absent'||row?.creatorstatus==='absent')return 'absent';
  return 'pending';
}
function buildMatchStatusHint({match={},registrations=[],viewerId='',viewerJoined=false}={}){
  const activeCount=activeMatchRegistrations(registrations).length;
  const formationStatus=String(match.formationstatus||match.formationStatus||'free_open');
  const timeline=matchTimelineStatus(match);
  if(timeline==='已结束'&&String(match.status||'')!=='settled')return '球局已结束，等待到场和费用确认';
  if(resolveEffectiveLevelRange(match,registrations).pending)return '未设水平时，以首位报名球友的真实水平定级';
  if(isFourPlayerGroupMatch(match)&&formationStatus==='group_ready')return '本局已成团，需在2小时内完成预付，全员付款成功约球生效';
  if(isFourPlayerGroupMatch(match)&&formationStatus==='group_locked')return '四人成团已锁定，如需退出请自行联系替补并由后台处理名额转让';
  if(isFourPlayerGroupMatch(match)&&activeCount<4)return '未满4人前仅占位报名，不收款，可自由取消';
  return '';
}
function buildGroupPrepayLedger({matchId,estimatedCourtFee=0,participantIds=[]}={}){
  const total=Math.round(normalizeMoney(estimatedCourtFee));
  if(total<=0)throw new Error('预付金额必须大于 0');
  const splits=splitAaFee(total,participantIds);
  return {
    record:{
      id:uuidv4(),
      matchId,
      estimatedCourtFee:total,
      finalCourtFee:total,
      participantCount:splits.length,
      aaAmount:Math.ceil(total/splits.length),
      roundingRule:'ceil',
      roundingDifference:total-splits.reduce((sum,row)=>sum+row.amount,0),
      status:'prepay_pending'
    },
    splits:splits.map(row=>({id:uuidv4(),matchId,userId:row.userId,amount:row.amount,payStatus:'pending',paidAmount:0}))
  };
}
async function syncMatchFeeRecordState(client,matchId,{isPrepay=false}={}){
  const activeSplitsRes=await client.query("SELECT payStatus FROM match_fee_splits WHERE matchId=$1 AND payStatus NOT IN ('cancelled','refunded')",[matchId]);
  const settled=activeSplitsRes.rows.length>0&&activeSplitsRes.rows.every(row=>['paid','waived'].includes(row.paystatus||row.payStatus));
  if(isPrepay){
    const status=settled?'prepay_paid':'prepay_pending';
    await client.query('UPDATE match_fee_records SET status=$1,updatedAt=NOW() WHERE matchId=$2',[status,matchId]);
    await client.query("UPDATE match_posts SET formationStatus=$2,updatedAt=NOW() WHERE id=$1",[matchId,settled?'group_locked':'group_ready']);
    return {settled,status};
  }
  const status=settled?'settled':'confirmed';
  await client.query('UPDATE match_fee_records SET status=$1,updatedAt=NOW() WHERE matchId=$2',[status,matchId]);
  if(settled)await client.query("UPDATE match_posts SET status='settled',updatedAt=NOW() WHERE id=$1",[matchId]);
  return {settled,status};
}
function buildMatchFeeLedger({matchId,estimatedCourtFee=0,finalCourtFee,matchType,startTime,endTime,participants=[]}={}){
  const billable=(participants||[]).filter(row=>row.finalStatus==='attended'||row.finalstatus==='attended'||row.chargeAbsent===true);
  const settlementTotal=computeMatchSettlementAmount({matchType,startTime,endTime,finalCourtFee,participantCount:billable.length});
  const splits=splitAaFee(settlementTotal,billable.map(row=>row.userId||row.userid));
  const distributedTotal=splits.reduce((sum,row)=>sum+row.amount,0);
  const aaAmount=Math.ceil(normalizeMoney(settlementTotal)/splits.length);
  return {
    record:{
      id:uuidv4(),
      matchId,
      estimatedCourtFee:normalizeMoney(estimatedCourtFee),
      finalCourtFee:Math.round(normalizeMoney(settlementTotal)),
      participantCount:splits.length,
      aaAmount,
      roundingRule:'ceil',
      roundingDifference:Math.round(normalizeMoney(settlementTotal))-distributedTotal,
      status:'pending'
    },
    splits:splits.map(row=>({id:uuidv4(),matchId,userId:row.userId,amount:row.amount,payStatus:'pending',paidAmount:0}))
  };
}
async function listMatchesForViewer(viewerId){
  const pool=getMatchSqlPool();
  const registrationSelect=`
    SELECT
      r.*,
      u.nickName,
      u.phone,
      u.avatarUrl,
      u.ntrpLevel,
      a.finalStatus,
      CASE
        WHEN stats.resolved_count > 0 THEN CONCAT(ROUND(stats.attended_count * 100.0 / stats.resolved_count), '%')
        ELSE '暂无守约率'
      END AS attendanceRateText
    FROM match_registrations r
    LEFT JOIN match_users u ON u.id=r.userId
    LEFT JOIN match_attendance a ON a.matchId=r.matchId AND a.userId=r.userId
    LEFT JOIN (
      SELECT
        userId,
        COUNT(*) FILTER (WHERE finalStatus IN ('attended','absent'))::int AS resolved_count,
        COUNT(*) FILTER (WHERE finalStatus='attended')::int AS attended_count
      FROM match_attendance
      GROUP BY userId
    ) stats ON stats.userId=r.userId
    WHERE r.registrationStatus='registered'
  `;
  const [matches,registrations]=await Promise.all([
    pool.query("SELECT * FROM match_posts WHERE status<>'cancelled' ORDER BY startTime ASC"),
    pool.query(registrationSelect)
  ]);
  const regsByMatch=new Map();
  for(const row of registrations.rows){
    const key=String(row.matchid||row.matchId);
    regsByMatch.set(key,[...(regsByMatch.get(key)||[]),row]);
  }
  return matches.rows.map(row=>toMatchView(row,regsByMatch.get(String(row.id))||[],viewerId));
}
async function getMatchForViewer(matchId,viewerId){
  const pool=getMatchSqlPool();
  const match=await pool.query('SELECT * FROM match_posts WHERE id=$1',[matchId]);
  if(!match.rows[0])return null;
  const [regs,splits]=await Promise.all([
    pool.query(`
      SELECT
        r.*,
        u.nickName,
        u.avatarUrl,
        u.phone,
        u.ntrpLevel,
        a.finalStatus,
        CASE
          WHEN stats.resolved_count > 0 THEN CONCAT(ROUND(stats.attended_count * 100.0 / stats.resolved_count), '%')
          ELSE '暂无守约率'
        END AS attendanceRateText
      FROM match_registrations r
      LEFT JOIN match_users u ON u.id=r.userId
      LEFT JOIN match_attendance a ON a.matchId=r.matchId AND a.userId=r.userId
      LEFT JOIN (
        SELECT
          userId,
          COUNT(*) FILTER (WHERE finalStatus IN ('attended','absent'))::int AS resolved_count,
          COUNT(*) FILTER (WHERE finalStatus='attended')::int AS attended_count
        FROM match_attendance
        GROUP BY userId
      ) stats ON stats.userId=r.userId
      WHERE r.matchId=$1
    `,[matchId]),
    pool.query('SELECT * FROM match_fee_splits WHERE matchId=$1',[matchId])
  ]);
  return toMatchView(match.rows[0],regs.rows,viewerId,splits.rows);
}
async function createMatchForUser(userId,input){
  if(!(await canMatchUserCreate(userId)))throw new Error('仅管理员可发起约球');
  const row=assertMatchPostInput(input);
  const id=uuidv4();
  await getMatchSqlPool().query(
    'INSERT INTO match_posts(id,creatorUserId,title,matchType,targetHeadcount,startTime,endTime,venueName,venueAddress,venueLatitude,venueLongitude,ntrpMin,ntrpMax,levelMode,genderPreference,estimatedCourtFee,status,formationStatus,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),NOW())',
    [id,userId,row.title,row.matchType,row.targetHeadcount,row.startTime,row.endTime,row.venueName||'',row.venueAddress||'',row.venueLatitude||null,row.venueLongitude||null,row.ntrpMin,row.ntrpMax,row.levelMode,row.genderPreference,row.estimatedCourtFee,'open','free_open']
  );
  return getMatchForViewer(id,userId);
}
async function updateMatchForUser(matchId,userId,input){
  const row=assertMatchPostInput(input);
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    if(String(match.creatoruserid||match.creatorUserId)!==String(userId))throw new Error('只有发起者可编辑');
    if(dateMs(match.starttime||match.startTime)<=Date.now())throw new Error('已开始，不能编辑');
    const regs=await client.query("SELECT COUNT(*)::int AS count FROM match_registrations WHERE matchId=$1 AND registrationStatus='registered'",[matchId]);
    await client.query(
      'UPDATE match_posts SET title=$1,matchType=$2,targetHeadcount=$3,startTime=$4,endTime=$5,venueName=$6,venueAddress=$7,venueLatitude=$8,venueLongitude=$9,ntrpMin=$10,ntrpMax=$11,levelMode=$12,genderPreference=$13,estimatedCourtFee=$14,updatedAt=NOW() WHERE id=$15',
      [row.title,row.matchType,row.targetHeadcount,row.startTime,row.endTime,row.venueName||'',row.venueAddress||'',row.venueLatitude||null,row.venueLongitude||null,row.ntrpMin,row.ntrpMax,row.levelMode,row.genderPreference,row.estimatedCourtFee,matchId]
    );
    if((regs.rows[0]?.count||0)>0){
      await client.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'match_user',userId,'match_update',JSON.stringify(match),JSON.stringify(row)]);
    }
    return {success:true};
  });
}
async function cancelMatchForUser(matchId,userId,reason=''){
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    if(String(match.creatoruserid||match.creatorUserId)!==String(userId))throw new Error('只有发起者可取消');
    if(!['open','full','booked'].includes(String(match.status||'open')))throw new Error('当前状态不能取消');
    if(dateMs(match.starttime||match.startTime)<=Date.now())throw new Error('已开始，不能取消');
    await client.query("UPDATE match_posts SET status='cancelled',cancelReason=$1,updatedAt=NOW() WHERE id=$2",[String(reason||'发起者取消'),matchId]);
    await client.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'match_user',userId,'match_cancel',JSON.stringify(match),JSON.stringify({reason})]);
    return {success:true,status:'cancelled'};
  });
}
async function cancelRegistrationForUser(matchId,userId){
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    const status=deriveMatchStatus(match);
    const formationStatus=String(match.formationstatus||match.formationStatus||'free_open');
    if(status==='booked')throw new Error('已订场，请联系运营处理');
    if(formationStatus==='group_locked')throw new Error('四人成团并付款后不能自主退局，请先联系替补');
    if(!['open','full'].includes(status))throw new Error('当前状态不能取消报名');
    if(dateMs(match.starttime||match.startTime)<=Date.now())throw new Error('已开始，不能取消报名');
    const result=await client.query("UPDATE match_registrations SET registrationStatus='cancelled',cancelledAt=NOW() WHERE matchId=$1 AND userId=$2 AND registrationStatus='registered' RETURNING id",[matchId,userId]);
    if(result.rowCount<=0)throw new Error('未报名');
    const countRes=await client.query("SELECT COUNT(*)::int AS count FROM match_registrations WHERE matchId=$1 AND registrationStatus='registered'",[matchId]);
    const nextCount=countRes.rows[0]?.count||0;
    const nextStatus=nextCount>=Number(match.targetheadcount||match.targetHeadcount)?'full':'open';
    if(isFourPlayerGroupMatch(match)&&nextCount<4){
      const feeRecordRes=await client.query('SELECT * FROM match_fee_records WHERE matchId=$1 LIMIT 1',[matchId]);
      const feeStatus=String(feeRecordRes.rows[0]?.status||'');
      if(/^prepay_/.test(feeStatus)){
        await client.query('DELETE FROM match_fee_splits WHERE matchId=$1',[matchId]);
        await client.query('DELETE FROM match_fee_records WHERE matchId=$1',[matchId]);
      }
      await client.query('UPDATE match_posts SET status=$1,formationStatus=$2,prepayTriggeredAt=NULL,prepayDeadlineAt=NULL,updatedAt=NOW() WHERE id=$3',[nextStatus,'free_open',matchId]);
      return {success:true,currentHeadcount:nextCount,status:nextStatus,formationStatus:'free_open'};
    }
    await client.query('UPDATE match_posts SET status=$1,updatedAt=NOW() WHERE id=$2',[nextStatus,matchId]);
    return {success:true,currentHeadcount:nextCount,status:nextStatus,formationStatus};
  });
}
async function listAdminMatches(){
  const pool=getMatchSqlPool();
  const [matches,registrations,bookings,fees,splits,logs]=await Promise.all([
    pool.query('SELECT * FROM match_posts ORDER BY startTime DESC'),
    pool.query('SELECT r.*,u.nickName,u.phone FROM match_registrations r LEFT JOIN match_users u ON u.id=r.userId'),
    pool.query('SELECT * FROM match_bookings ORDER BY createdAt DESC'),
    pool.query('SELECT * FROM match_fee_records ORDER BY createdAt DESC'),
    pool.query('SELECT s.*,u.nickName,u.phone FROM match_fee_splits s LEFT JOIN match_users u ON u.id=s.userId ORDER BY s.createdAt ASC'),
    pool.query('SELECT * FROM match_operation_logs ORDER BY createdAt DESC')
  ]);
  const regsByMatch=new Map();
  for(const row of registrations.rows){
    const key=String(row.matchid||row.matchId);
    regsByMatch.set(key,[...(regsByMatch.get(key)||[]),row]);
  }
  const bookingByMatch=new Map(bookings.rows.map(row=>[String(row.matchid||row.matchId),row]));
  const feeByMatch=new Map(fees.rows.map(row=>[String(row.matchid||row.matchId),row]));
  const feeSplitsByMatch=new Map();
  for(const row of splits.rows){
    const key=String(row.matchid||row.matchId);
    feeSplitsByMatch.set(key,[...(feeSplitsByMatch.get(key)||[]),row]);
  }
  const logsByMatch=new Map();
  for(const row of logs.rows){
    const key=String(row.matchid||row.matchId);
    logsByMatch.set(key,[...(logsByMatch.get(key)||[]),row]);
  }
  return matches.rows.map(row=>({...toMatchView(row,regsByMatch.get(String(row.id))||[],''),booking:bookingByMatch.get(String(row.id))||null,feeRecord:feeByMatch.get(String(row.id))||null,feeSplits:feeSplitsByMatch.get(String(row.id))||[],operationLogs:logsByMatch.get(String(row.id))||[]}));
}
async function adminBookMatch(matchId,operatorId,input){
  const booking=assertMatchBookingInput(input);
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    const id=uuidv4();
    await client.query(
      'INSERT INTO match_bookings(id,matchId,operatorUserId,venueNameFinal,venueAddressFinal,venueLatitudeFinal,venueLongitudeFinal,courtNo,bookingStartTime,bookingEndTime,finalCourtFee,bookingStatus,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())',
      [id,matchId,operatorId,booking.venueNameFinal||'',booking.venueAddressFinal||'',booking.venueLatitudeFinal||null,booking.venueLongitudeFinal||null,booking.courtNo||'',booking.bookingStartTime||match.starttime||match.startTime,booking.bookingEndTime||match.endtime||match.endTime,booking.finalCourtFee,booking.bookingStatus]
    );
    const nextStatus=booking.bookingStatus==='booked'?'booked':'cancelled';
    await client.query('UPDATE match_posts SET status=$1,finalCourtFee=$2,updatedAt=NOW() WHERE id=$3',[nextStatus,booking.finalCourtFee,matchId]);
    await client.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'admin_user',operatorId,'booking',JSON.stringify(match),JSON.stringify(booking)]);
    notifyMatchUsers(matchId,'booking').catch(()=>null);
    return {success:true,matchId,status:nextStatus,bookingId:id,finalCourtFee:booking.finalCourtFee};
  });
}
async function confirmMatchAttendance(matchId,operatorId,items=[]){
  if(!Array.isArray(items)||items.length===0)throw new Error('请提交到场名单');
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    for(const item of items){
      const userId=String(item.userId||'').trim();
      if(!userId)continue;
      const creatorStatus=item.finalStatus||item.creatorStatus;
      if(!['attended','absent'].includes(creatorStatus))throw new Error('到场状态不正确');
      const finalStatus=resolveFinalAttendanceStatus({creatorStatus});
      await client.query(
        "INSERT INTO match_attendance(id,matchId,userId,selfStatus,creatorStatus,finalStatus,updatedAt) VALUES($1,$2,$3,'pending',$4,$5,NOW()) ON CONFLICT(matchId,userId) DO UPDATE SET creatorStatus=EXCLUDED.creatorStatus,finalStatus=EXCLUDED.finalStatus,updatedAt=NOW()",
        [uuidv4(),matchId,userId,creatorStatus,finalStatus]
      );
    }
    await client.query("UPDATE match_posts SET status='fee_pending',updatedAt=NOW() WHERE id=$1",[matchId]);
    await client.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'admin_user',operatorId,'attendance_confirm',JSON.stringify(match),JSON.stringify(items)]);
    return {success:true,status:'fee_pending'};
  });
}
async function adminHandleBookedWithdrawal(matchId,userId,operatorId,input={}){
  const withdrawal=assertBookedWithdrawalInput(input);
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    const status=deriveMatchStatus(match);
    if(status!=='booked')throw new Error('只有已订场球局需要后台处理退赛');
    const regRes=await client.query("SELECT * FROM match_registrations WHERE matchId=$1 AND userId=$2 AND registrationStatus='registered' FOR UPDATE",[matchId,userId]);
    const reg=regRes.rows[0];
    if(!reg)throw new Error('报名记录不存在');
    await client.query(
      "UPDATE match_registrations SET registrationStatus='cancelled',cancelledAt=NOW(),financialResponsibility=$1,withdrawalReason=$2,withdrawalHandledBy=$3,withdrawalHandledAt=NOW() WHERE matchId=$4 AND userId=$5 AND registrationStatus='registered'",
      [withdrawal.financialResponsibility,withdrawal.reason,operatorId,matchId,userId]
    );
    await client.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'admin_user',operatorId,'booked_withdrawal',JSON.stringify(reg),JSON.stringify(withdrawal)]);
    return {success:true,financialResponsibility:withdrawal.financialResponsibility};
  });
}
async function adminTransferMatchReplacement(matchId,operatorId,input={}){
  const transfer=assertMatchReplacementTransferInput(input);
  const financeSync={refund:null,paid:null};
  const result=await withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    if(!isFourPlayerGroupMatch(match))throw new Error('当前仅支持四人局替补转让');
    const formationStatus=String(match.formationstatus||match.formationStatus||'free_open');
    if(!['group_ready','group_locked'].includes(formationStatus))throw new Error('当前状态无需替补转让');
    const [fromRegRes,replacementUserRes]=await Promise.all([
      client.query("SELECT r.*,u.nickName,u.phone FROM match_registrations r LEFT JOIN match_users u ON u.id=r.userId WHERE r.matchId=$1 AND r.userId=$2 AND r.registrationStatus='registered' FOR UPDATE",[matchId,transfer.fromUserId]),
      client.query('SELECT * FROM match_users WHERE phone=$1 ORDER BY updatedAt DESC LIMIT 1',[transfer.replacementPhone])
    ]);
    const fromReg=fromRegRes.rows[0];
    if(!fromReg)throw new Error('原报名记录不存在');
    const replacementUser=replacementUserRes.rows[0];
    if(!replacementUser)throw new Error('替补用户不存在，请先让对方登录小程序并完成手机号授权');
    const replacementUserId=String(replacementUser.id||'');
    if(replacementUserId===String(transfer.fromUserId))throw new Error('替补用户不能和原报名人相同');
    const replacementDupRes=await client.query("SELECT id FROM match_registrations WHERE matchId=$1 AND userId=$2 AND registrationStatus='registered' LIMIT 1",[matchId,replacementUserId]);
    if(replacementDupRes.rowCount>0)throw new Error('替补用户已经在本局报名名单里');
    const replacementLevel=Number(replacementUser.ntrplevel||replacementUser.ntrpLevel||0);
    const matchMinLevel=Number(match.ntrpmin||match.ntrpMin||0);
    if(!isValidNtrp(replacementLevel))throw new Error('替补用户还没有设置真实水平');
    if(isValidNtrp(matchMinLevel)&&replacementLevel<matchMinLevel)throw new Error(`本局最低水平为 ${matchMinLevel.toFixed(1)}，替补不符合要求`);
    const feeRecordRes=await client.query('SELECT * FROM match_fee_records WHERE matchId=$1 FOR UPDATE',[matchId]);
    const feeRecord=feeRecordRes.rows[0]||null;
    const isPrepay=/^prepay_/.test(String(feeRecord?.status||''));
    let previousSplit=null;
    if(feeRecord){
      const splitRes=await client.query('SELECT * FROM match_fee_splits WHERE matchId=$1 AND userId=$2 FOR UPDATE',[matchId,transfer.fromUserId]);
      previousSplit=splitRes.rows[0]||null;
      if(!previousSplit)throw new Error('原报名人的账单不存在');
    }

    const replacementRegistrationId=uuidv4();
    await client.query(
      "UPDATE match_registrations SET registrationStatus='cancelled',cancelledAt=NOW(),financialResponsibility='transferred',withdrawalReason=$1,withdrawalHandledBy=$2,withdrawalHandledAt=NOW() WHERE id=$3",
      [transfer.refundNote,operatorId,fromReg.id]
    );
    await client.query(
      "INSERT INTO match_registrations(id,matchId,userId,registrationStatus,createdAt,financialResponsibility,withdrawalReason) VALUES($1,$2,$3,'registered',NOW(),$4,$5)",
      [replacementRegistrationId,matchId,replacementUserId,'replacement',transfer.transferNote||'']
    );
    await client.query('DELETE FROM match_attendance WHERE matchId=$1 AND userId=$2',[matchId,replacementUserId]);

    let replacementSplitId='';
    let originalSplitStatus='';
    if(previousSplit){
      const amount=normalizeMoney(previousSplit.amount);
      const previousPaidAmount=normalizeMoney(previousSplit.paidamount||previousSplit.paidAmount);
      originalSplitStatus=previousPaidAmount>0?'refunded':'cancelled';
      await client.query(
        'UPDATE match_fee_splits SET payStatus=$1,paidAmount=$2,paidAt=$3,note=$4,updatedAt=NOW() WHERE matchId=$5 AND userId=$6',
        [originalSplitStatus,previousPaidAmount,originalSplitStatus==='refunded'?new Date():null,transfer.refundNote,matchId,transfer.fromUserId]
      );
      replacementSplitId=uuidv4();
      const replacementPaidAmount=transfer.replacementPayStatus==='paid'?amount:0;
      await client.query(
        'INSERT INTO match_fee_splits(id,matchId,userId,amount,payStatus,paidAmount,paidAt,note,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())',
        [replacementSplitId,matchId,replacementUserId,amount,transfer.replacementPayStatus,replacementPaidAmount,transfer.replacementPayStatus==='paid'?new Date():null,transfer.transferNote||transfer.refundNote]
      );
      if(feeRecord){
        const nextFeeState=await syncMatchFeeRecordState(client,matchId,{isPrepay});
        if(isPrepay&&nextFeeState.status==='prepay_pending'){
          await client.query("UPDATE match_posts SET status='full',updatedAt=NOW() WHERE id=$1",[matchId]);
        }
      }
      financeSync.refund=!isPrepay&&originalSplitStatus==='refunded'?{needed:true}:null;
      financeSync.paid=!isPrepay&&transfer.replacementPayStatus==='paid'?{needed:true,userId:replacementUserId}:null;
    }

    const replacementRowId=uuidv4();
    await client.query(
      'INSERT INTO match_replacements(id,matchId,fromUserId,toUserId,operatorUserId,originalSplitAmount,originalSplitRefundedAmount,replacementSplitAmount,replacementPayStatus,reason,note,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())',
      [
        replacementRowId,
        matchId,
        transfer.fromUserId,
        replacementUserId,
        operatorId,
        normalizeMoney(previousSplit?.amount||0),
        normalizeMoney(previousSplit?.paidamount||previousSplit?.paidAmount||0),
        normalizeMoney(previousSplit?.amount||0),
        transfer.replacementPayStatus,
        transfer.refundNote,
        transfer.transferNote||''
      ]
    );
    await client.query(
      'INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',
      [
        uuidv4(),
        matchId,
        'admin_user',
        operatorId,
        'replacement_transfer',
        JSON.stringify({fromUserId:transfer.fromUserId,fromPhone:fromReg.phone||'',fromNickName:fromReg.nickname||fromReg.nickName||''}),
        JSON.stringify({toUserId:replacementUserId,toPhone:replacementUser.phone||'',toNickName:replacementUser.nickname||replacementUser.nickName||'',replacementPayStatus:transfer.replacementPayStatus,reason:transfer.refundNote,note:transfer.transferNote||''})
      ]
    );
    return {
      success:true,
      fromUserId:transfer.fromUserId,
      toUserId:replacementUserId,
      replacementPayStatus:transfer.replacementPayStatus,
      replacementNickName:replacementUser.nickname||replacementUser.nickName||maskPhone(replacementUser.phone)||replacementUserId,
      message:transfer.replacementPayStatus==='paid'?'替补已入局并完成付款':'替补名额已转让，等待替补付款'
    };
  });
  if(financeSync.refund?.needed)result.refundSync=await syncMatchFeeSplitRefundToCourtFinance(matchId,transfer.fromUserId,operatorId,transfer.refundNote);
  if(financeSync.paid?.needed)result.paidSync=await syncMatchFeeSplitToCourtFinance(matchId,financeSync.paid.userId,operatorId);
  notifyMatchUsers(matchId,'match_update').catch(()=>null);
  return result;
}
async function selfConfirmMatchAttendance(matchId,userId){
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    const status=deriveMatchStatus(match);
    if(!['booked','playing','attendance_pending'].includes(status))throw new Error('当前还不能确认到场');
    if(dateMs(match.starttime||match.startTime)>Date.now())throw new Error('未到开始时间');
    const reg=await client.query("SELECT id FROM match_registrations WHERE matchId=$1 AND userId=$2 AND registrationStatus='registered'",[matchId,userId]);
    if(reg.rowCount<=0)throw new Error('未报名，不能确认到场');
    await client.query(
      "INSERT INTO match_attendance(id,matchId,userId,selfStatus,creatorStatus,finalStatus,updatedAt) VALUES($1,$2,$3,'attended','pending','pending',NOW()) ON CONFLICT(matchId,userId) DO UPDATE SET selfStatus='attended',updatedAt=NOW()",
      [uuidv4(),matchId,userId]
    );
    return {success:true,selfStatus:'attended'};
  });
}
async function creatorConfirmMatchAttendance(matchId,creatorUserId,registrationId,finalStatus){
  if(!['attended','absent'].includes(finalStatus))throw new Error('到场状态不正确');
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    if(String(match.creatoruserid||match.creatorUserId)!==String(creatorUserId))throw new Error('只有发起者可确认');
    const reg=await client.query('SELECT * FROM match_registrations WHERE id=$1 AND matchId=$2',[registrationId,matchId]);
    const row=reg.rows[0];
    if(!row)throw new Error('报名记录不存在');
    const feeRecord=await client.query('SELECT id FROM match_fee_records WHERE matchId=$1 LIMIT 1',[matchId]);
    if(feeRecord.rowCount>0)throw new Error('已生成AA，不能再修改到场名单');
    const confirmDeadline=dateMs(match.endtime||match.endTime)+(MATCH_CREATOR_CONFIRM_DEADLINE_HOURS*60*60*1000);
    if(Number.isFinite(confirmDeadline)&&Date.now()>confirmDeadline)throw new Error('已超过发起者确认时限，请联系运营处理');
    await client.query(
      "INSERT INTO match_attendance(id,matchId,userId,selfStatus,creatorStatus,finalStatus,updatedAt) VALUES($1,$2,$3,'pending',$4,$4,NOW()) ON CONFLICT(matchId,userId) DO UPDATE SET creatorStatus=$4,finalStatus=$4,updatedAt=NOW()",
      [uuidv4(),matchId,row.userid||row.userId,finalStatus]
    );
    return {success:true,finalStatus};
  });
}
async function generateMatchFeeLedger(matchId,operatorId,{chargeAbsentUserIds=[]}={}){
  const chargeAbsentSet=new Set((chargeAbsentUserIds||[]).map(String));
  const result=await withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    const bookingRes=await client.query("SELECT * FROM match_bookings WHERE matchId=$1 AND bookingStatus='booked' ORDER BY createdAt DESC LIMIT 1",[matchId]);
    const finalCourtFee=bookingRes.rows[0]?.finalcourtfee||bookingRes.rows[0]?.finalCourtFee||match.finalcourtfee||match.finalCourtFee;
    const attendanceRes=await client.query('SELECT * FROM match_attendance WHERE matchId=$1',[matchId]);
    const activeRegsRes=await client.query("SELECT userId FROM match_registrations WHERE matchId=$1 AND registrationStatus='registered'",[matchId]);
    const confirmedAttendanceUserIds=new Set(
      attendanceRes.rows
        .filter(row=>['attended','absent'].includes(row.finalstatus||row.finalStatus))
        .map(row=>String(row.userid||row.userId))
    );
    const unconfirmedUsers=activeRegsRes.rows.filter(row=>!confirmedAttendanceUserIds.has(String(row.userid||row.userId)));
    if(unconfirmedUsers.length)throw new Error('请先完成全部到场确认，再生成AA');
    const chargeWithdrawalRes=await client.query("SELECT userId FROM match_registrations WHERE matchId=$1 AND registrationStatus='cancelled' AND financialResponsibility='charge'",[matchId]);
    const existingSplitsRes=await client.query('SELECT * FROM match_fee_splits WHERE matchId=$1',[matchId]);
    const existingPaidByUser=new Map(existingSplitsRes.rows.map(row=>[String(row.userid||row.userId),normalizeMoney(row.paidamount||row.paidAmount)]));
    const ledger=buildMatchFeeLedger({
      matchId,
      estimatedCourtFee:match.estimatedcourtfee||match.estimatedCourtFee,
      finalCourtFee,
      matchType:match.matchtype||match.matchType,
      startTime:match.starttime||match.startTime,
      endTime:match.endtime||match.endTime,
      participants:[
        ...attendanceRes.rows.map(row=>({...row,chargeAbsent:chargeAbsentSet.has(String(row.userid||row.userId))})),
        ...chargeWithdrawalRes.rows.map(row=>({userId:row.userid||row.userId,finalStatus:'absent',chargeAbsent:true}))
      ]
    });
    ledger.splits=ledger.splits.map(split=>{
      const paidAmount=existingPaidByUser.get(String(split.userId))||0;
      return {...split,paidAmount,payStatus:paidAmount>=split.amount?'paid':'pending'};
    });
    await client.query('DELETE FROM match_fee_splits WHERE matchId=$1',[matchId]);
    await client.query('DELETE FROM match_fee_records WHERE matchId=$1',[matchId]);
    await client.query(
      'INSERT INTO match_fee_records(id,matchId,estimatedCourtFee,finalCourtFee,participantCount,aaAmount,roundingRule,roundingDifference,status,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())',
      [ledger.record.id,matchId,ledger.record.estimatedCourtFee,ledger.record.finalCourtFee,ledger.record.participantCount,ledger.record.aaAmount,ledger.record.roundingRule,ledger.record.roundingDifference,ledger.splits.every(row=>row.payStatus==='paid')?'settled':ledger.record.status]
    );
    for(const split of ledger.splits){
      await client.query('INSERT INTO match_fee_splits(id,matchId,userId,amount,payStatus,paidAmount,paidAt,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())',[split.id,matchId,split.userId,split.amount,split.payStatus,split.paidAmount,split.payStatus==='paid'?new Date():null]);
    }
    await client.query("UPDATE match_posts SET status=$2,updatedAt=NOW() WHERE id=$1",[matchId,ledger.splits.every(row=>row.payStatus==='paid')?'settled':'fee_pending']);
    await client.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'admin_user',operatorId,'fee_generate',JSON.stringify(match),JSON.stringify(ledger.record)]);
    notifyMatchUsers(matchId,'fee_generate').catch(()=>null);
    return {ledger,paidUserIds:ledger.splits.filter(row=>row.payStatus==='paid').map(row=>String(row.userId))};
  });
  for(const paidUserId of result.paidUserIds){
    await syncMatchFeeSplitToCourtFinance(matchId,paidUserId,operatorId).catch(()=>null);
  }
  return result.ledger;
}
async function markMatchFeeSplit(matchId,userId,operatorId,input={}){
  const update=assertMatchFeeSplitUpdateInput(input);
  const result=await withMatchSqlTransaction(async(client)=>{
    const feeRecordRes=await client.query('SELECT * FROM match_fee_records WHERE matchId=$1 FOR UPDATE',[matchId]);
    const feeRecord=feeRecordRes.rows[0]||{};
    const isPrepay=/^prepay_/.test(String(feeRecord.status||''));
    const splitRes=await client.query('SELECT * FROM match_fee_splits WHERE matchId=$1 AND userId=$2 FOR UPDATE',[matchId,userId]);
    const split=splitRes.rows[0];
    if(!split)throw new Error('账单不存在');
    const amount=update.amount==null?normalizeMoney(split.amount):normalizeMoney(update.amount);
    const previousPaidAmount=normalizeMoney(split.paidamount||split.paidAmount);
    if(update.payStatus==='refunded'&&String(split.paystatus||split.payStatus)!=='paid'&&previousPaidAmount<=0)throw new Error('未收款不能退款');
    const nextPaidAmount=update.paidAmount==null?(update.payStatus==='paid'?amount:(update.payStatus==='refunded'?previousPaidAmount:0)):update.paidAmount;
    await client.query('UPDATE match_fee_splits SET amount=$1,payStatus=$2,paidAmount=$3,paidAt=$4,note=$5,updatedAt=NOW() WHERE matchId=$6 AND userId=$7',[amount,update.payStatus,nextPaidAmount,update.payStatus==='paid'?new Date():null,update.note,matchId,userId]);
    const feeRowsRes=await client.query("SELECT * FROM match_fee_splits WHERE matchId=$1 AND payStatus NOT IN ('cancelled','refunded')",[matchId]);
    const activeRows=feeRowsRes.rows;
    const participantCount=activeRows.length;
    const finalCourtFee=activeRows.reduce((sum,row)=>sum+normalizeMoney(row.amount),0);
    const aaAmount=participantCount>0?Math.ceil(finalCourtFee/participantCount):0;
    const distributedTotal=activeRows.reduce((sum,row)=>sum+normalizeMoney(row.amount),0);
    await client.query('UPDATE match_fee_records SET finalCourtFee=$1,participantCount=$2,aaAmount=$3,roundingDifference=$4,updatedAt=NOW() WHERE matchId=$5',[finalCourtFee,participantCount,aaAmount,finalCourtFee-distributedTotal,matchId]);
    const nextState=await syncMatchFeeRecordState(client,matchId,{isPrepay});
    await client.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'admin_user',operatorId,'fee_split_update',JSON.stringify(split),JSON.stringify({amount,payStatus:update.payStatus,paidAmount:nextPaidAmount,note:update.note})]);
    return {success:true,status:nextState.status,isPrepay};
  });
  if(!result.isPrepay&&update.payStatus==='paid')result.financeSync=await syncMatchFeeSplitToCourtFinance(matchId,userId,operatorId);
  if(!result.isPrepay&&update.payStatus==='refunded')result.financeSync=await syncMatchFeeSplitRefundToCourtFinance(matchId,userId,operatorId,update.note);
  return result;
}
function buildMatchProfileStats({createdMatches=[],joinedMatches=[],attendanceRows=[],feeSplits=[]}={}){
  const resolvedAttendance=(attendanceRows||[]).filter(row=>['attended','absent'].includes(row.finalStatus||row.finalstatus));
  const attended=resolvedAttendance.filter(row=>(row.finalStatus||row.finalstatus)==='attended').length;
  const attendanceRate=resolvedAttendance.length?Math.round(attended*100/resolvedAttendance.length):0;
  return {
    createdCount:(createdMatches||[]).length,
    joinedCount:(joinedMatches||[]).length,
    matchCreatedCount:(createdMatches||[]).length,
    matchJoinedCount:(joinedMatches||[]).length,
    matchCompletedCount:resolvedAttendance.length,
    attendanceRate,
    attendanceRateText:resolvedAttendance.length?`${attendanceRate}%`:'暂无记录',
    totalFeeAmount:(feeSplits||[]).reduce((sum,row)=>sum+normalizeMoney(row.amount),0)
  };
}
async function listMyMatches(userId){
  const pool=getMatchSqlPool();
  const rows=await pool.query(
    "SELECT DISTINCT p.* FROM match_posts p LEFT JOIN match_registrations r ON r.matchId=p.id LEFT JOIN match_attendance a ON a.matchId=p.id WHERE p.creatorUserId=$1 OR (r.userId=$1 AND r.registrationStatus='registered') OR a.userId=$1 ORDER BY p.startTime DESC",
    [userId]
  );
  const registrations=await pool.query(`
    SELECT
      r.*,
      u.nickName,
      u.phone,
      u.avatarUrl,
      u.ntrpLevel,
      a.finalStatus,
      CASE
        WHEN stats.resolved_count > 0 THEN CONCAT(ROUND(stats.attended_count * 100.0 / stats.resolved_count), '%')
        ELSE '暂无守约率'
      END AS attendanceRateText
    FROM match_registrations r
    LEFT JOIN match_users u ON u.id=r.userId
    LEFT JOIN match_attendance a ON a.matchId=r.matchId AND a.userId=r.userId
    LEFT JOIN (
      SELECT
        userId,
        COUNT(*) FILTER (WHERE finalStatus IN ('attended','absent'))::int AS resolved_count,
        COUNT(*) FILTER (WHERE finalStatus='attended')::int AS attended_count
      FROM match_attendance
      GROUP BY userId
    ) stats ON stats.userId=r.userId
    WHERE r.registrationStatus='registered'
  `);
  const regsByMatch=new Map();
  for(const row of registrations.rows){
    const key=String(row.matchid||row.matchId);
    regsByMatch.set(key,[...(regsByMatch.get(key)||[]),row]);
  }
  return rows.rows.map(row=>toMatchView(row,regsByMatch.get(String(row.id))||[],userId));
}
async function getMatchProfile(userId){
  const pool=getMatchSqlPool();
  const [userRes,created,joined,attendance,fees]=await Promise.all([
    pool.query('SELECT * FROM match_users WHERE id=$1',[userId]),
    pool.query('SELECT id FROM match_posts WHERE creatorUserId=$1',[userId]),
    pool.query("SELECT DISTINCT matchId AS id FROM match_registrations WHERE userId=$1 AND registrationStatus='registered'",[userId]),
    pool.query('SELECT a.*,p.status AS matchStatus FROM match_attendance a LEFT JOIN match_posts p ON p.id=a.matchId WHERE a.userId=$1',[userId]),
    pool.query('SELECT * FROM match_fee_splits WHERE userId=$1',[userId])
  ]);
  const stats=buildMatchProfileStats({createdMatches:created.rows,joinedMatches:joined.rows,attendanceRows:attendance.rows,feeSplits:fees.rows});
  const user=userRes.rows[0]||{};
  return {...stats,user:{id:user.id,phone:user.phone||'',nickName:user.nickname||user.nickName||'',avatarUrl:user.avatarurl||user.avatarUrl||'',ntrpLevel:user.ntrplevel||user.ntrpLevel||'',canCreateMatch:await canMatchUserCreate(userId)}};
}
async function updateMatchProfile(userId,input){
  const phone=assertPhone(input.phone||'');
  const ntrpLevel=input.ntrpLevel==null?'':String(input.ntrpLevel||'').trim();
  const nickName=input.nickName==null?'':String(input.nickName||'').trim();
  const avatarUrl=input.avatarUrl==null?'':String(input.avatarUrl||'').trim();
  await getMatchSqlPool().query(
    'UPDATE match_users SET phone=COALESCE(NULLIF($2,$6),phone),ntrpLevel=COALESCE(NULLIF($3,$6),ntrpLevel),nickName=COALESCE(NULLIF($4,$6),nickName),avatarUrl=COALESCE(NULLIF($5,$6),avatarUrl),updatedAt=NOW() WHERE id=$1',
    [userId,phone,ntrpLevel,nickName,avatarUrl,'']
  );
  return getMatchProfile(userId);
}
async function listMatchNotifications(userId){
  const rows=await getMatchSqlPool().query(
    "SELECT l.*,p.title FROM match_operation_logs l LEFT JOIN match_posts p ON p.id=l.matchId LEFT JOIN match_registrations r ON r.matchId=l.matchId AND r.userId=$1 WHERE p.creatorUserId=$1 OR r.userId=$1 ORDER BY l.createdAt DESC LIMIT 50",
    [userId]
  );
  return rows.rows.map(row=>({
    id:row.id,
    matchId:row.matchid||row.matchId,
    title:row.title||'约球通知',
    action:row.action,
    content:matchNotificationText(row.action,row.title),
    createdAt:row.createdat||row.createdAt
  }));
}
function matchNotificationText(action,title=''){
  const name=title||'球局';
  return ({booking:`${name} 已更新订场信息`,match_cancel:`${name} 已取消`,fee_generate:`${name} 已生成 AA 应收`,attendance_confirm:`${name} 已确认到场名单`,match_update:`${name} 信息已更新`})[action]||`${name} 有新动态`;
}
async function listMatchPlayers(){
  const rows=await getMatchSqlPool().query(
    "SELECT u.id,u.nickName,u.avatarUrl,u.ntrpLevel,COUNT(r.id)::int AS joinedCount FROM match_users u LEFT JOIN match_registrations r ON r.userId=u.id AND r.registrationStatus='registered' GROUP BY u.id ORDER BY joinedCount DESC,u.createdAt DESC LIMIT 100"
  );
  return rows.rows.map(row=>({id:row.id,nickName:row.nickname||row.nickName||'球友',avatarUrl:row.avatarurl||row.avatarUrl||'',ntrpLevel:row.ntrplevel||row.ntrpLevel||'',joinedCount:row.joinedcount||row.joinedCount||0}));
}
function normalizePhone(value){return String(value||'').replace(/\s+/g,'').trim();}
function isValidCnPhone(value){return /^1[3-9]\d{9}$/.test(normalizePhone(value));}
function assertPhone(value){
  const phone=normalizePhone(value);
  if(phone&&!isValidCnPhone(phone))throw new Error('手机号格式不正确');
  return phone;
}
function normalizeMoney(value){
  const n=parseFloat(String(value??'').replace(/,/g,''));
  return Number.isFinite(n)?n:0;
}
function defaultMabaoPricePlans(){
  const venue=[
    ['工作日','06:00','08:00',100],
    ['工作日','08:00','16:00',140],
    ['工作日','16:00','20:00',220],
    ['工作日','20:00','22:00',180],
    ['周末节假日','06:00','08:00',100],
    ['周末节假日','08:00','22:00',220]
  ].map(([dateType,startTime,endTime,unitPrice])=>({type:'venue_rate',campus:'mabao',venueSpaceType:'室内',dateType,startTime,endTime,unitPrice,status:'active',notes:'默认马坡场地价'}));
  const products=[
    ['青少年1v1私教体验课','体验课','lesson','1小时',60,199],
    ['成人1v1私教体验课','体验课','lesson','1小时',60,239],
    ['青少年1v4小班课体验课','小班课','lesson','1-2小时',0,99],
    ['成人1v4小班课体验课','小班课','lesson','1-2小时',0,129],
    ['王牌专项：2.5~3.0多球实战特训','体验课','lesson','1-2小时',0,200],
    ['发接发与实战练习','体验课','lesson','1-2小时',0,260],
    ['削球实战训练','体验课','lesson','1-2小时',0,260],
    ['截击入门训练','体验课','lesson','1-2小时',0,260],
    ['疯狂多球训练','体验课','lesson','1-2小时',0,260],
    ['新客福利 约球双打局 2H','订场券','court','2小时',120,70],
    ['晚场福利 场地预定 1H','订场券','court','1小时',60,180],
    ['黄金时段 场地预定 1H','订场券','court','1小时',60,220],
    ['实力之选 网球陪打 1H','订场券','court','1小时',60,100],
    ['闲时特惠 场地预定 1H','订场券','court','1小时',60,140],
    ['刷球时刻 网球发球机畅打 1H','订场券','court','1小时',60,60],
    ['晨练 场地预定 30min','订场券','court','30min',30,50]
  ].map(([productName,productType,businessType,durationLabel,durationMinutes,salePrice])=>({type:'channel_product',channel:'大众点评',productName,productType,businessType,durationLabel,durationMinutes,salePrice,status:'active',notes:'默认大众点评商品价'}));
  return [...venue,...products];
}
function normalizeDefaultPriceName(name){
  return String(name||'').replace(/[：:\s]/g,'').replace(/体验课$/,'体验').trim();
}
function assertPricePlanInput(plan){
  const type=String(plan?.type||'').trim();
  if(!['venue_rate','channel_product'].includes(type))throw new Error('请选择价格类型');
  if(type==='venue_rate'){
    if(!String(plan.campus||'').trim())throw new Error('请选择校区');
    if(!String(plan.venueSpaceType||'').trim())throw new Error('请选择场地类型');
    if(!String(plan.dateType||'').trim())throw new Error('请选择日期类型');
    const start=clockMin(plan.startTime),end=clockMin(plan.endTime);
    if(!Number.isFinite(start)||!Number.isFinite(end))throw new Error('请填写有效时间段');
    if(end<=start)throw new Error('结束时间必须晚于开始时间');
    if(normalizeMoney(plan.unitPrice)<=0)throw new Error('场地价格必须大于 0');
  }
  if(type==='channel_product'){
    if(!String(plan.channel||'').trim())throw new Error('请选择渠道');
    if(!String(plan.productName||'').trim())throw new Error('请填写渠道商品名称');
    if(!String(plan.productType||'').trim())throw new Error('请选择商品类型');
    if(!String(plan.businessType||'').trim())throw new Error('请选择关联业务');
    if(String(plan.businessType||'').trim()==='court'&&(parseInt(plan.durationMinutes)||0)<=0&&!String(plan.durationLabel||'').trim())throw new Error('订场券请填写时长');
    if(normalizeMoney(plan.salePrice)<=0)throw new Error('渠道商品售价必须大于 0');
  }
}
function normalizePricePlan(input={},id=uuidv4(),now=new Date().toISOString(),old=null){
  const type=String(input.type||old?.type||'').trim();
  const base={
    id,
    type,
    campus:String(input.campus??old?.campus??'').trim(),
    venueSpaceType:String(input.venueSpaceType??old?.venueSpaceType??'室内').trim()||'室内',
    dateType:String(input.dateType??old?.dateType??'').trim(),
    startTime:String(input.startTime??old?.startTime??'').trim(),
    endTime:String(input.endTime??old?.endTime??'').trim(),
    unitPrice:normalizeMoney(input.unitPrice??old?.unitPrice),
    channel:String(input.channel??old?.channel??'').trim(),
    productName:String(input.productName??old?.productName??'').trim(),
    productType:String(input.productType??old?.productType??'').trim(),
    businessType:String(input.businessType??old?.businessType??'').trim(),
    durationMinutes:parseInt(input.durationMinutes??old?.durationMinutes)||0,
    durationLabel:String(input.durationLabel??old?.durationLabel??'').trim(),
    salePrice:normalizeMoney(input.salePrice??old?.salePrice),
    status:String(input.status??old?.status??'active').trim()||'active',
    effectiveFrom:String(input.effectiveFrom??old?.effectiveFrom??'').trim(),
    effectiveTo:String(input.effectiveTo??old?.effectiveTo??'').trim(),
    notes:String(input.notes??old?.notes??'').trim(),
    createdAt:old?.createdAt||input.createdAt||now,
    updatedAt:now
  };
  if(base.type==='venue_rate'){
    base.channel='';
    base.productName='';
    base.productType='';
    base.businessType='';
    base.durationMinutes=0;
    base.durationLabel='';
    base.salePrice=0;
  }
  if(base.type==='channel_product'){
    base.campus='';
    base.venueSpaceType='';
    base.dateType='';
    base.startTime='';
    base.endTime='';
    base.unitPrice=0;
  }
  assertPricePlanInput(base);
  return base;
}
async function syncDefaultPricePlans(){
  const existing=await scan(T_PRICE_PLANS).catch(()=>[]);
  const now=new Date().toISOString();
  for(const row of defaultMabaoPricePlans()){
    const same=existing.find(p=>{
      if(p.type!==row.type)return false;
      if(row.type==='venue_rate')return p.campus===row.campus&&p.dateType===row.dateType&&p.startTime===row.startTime&&p.endTime===row.endTime;
      return p.channel===row.channel&&normalizeDefaultPriceName(p.productName)===normalizeDefaultPriceName(row.productName);
    });
    const normalized=normalizePricePlan(row,same?.id||uuidv4(),now,same||null);
    await put(T_PRICE_PLANS,normalized.id,normalized);
    if(!same)existing.push(normalized);
  }
}
function priceDateType(date){
  const d=new Date(`${dateKey(date)}T00:00:00`);
  const day=d.getDay();
  return day===0||day===6?'周末节假日':'工作日';
}
function roundMoney(n){return Math.round((Number(n)||0)*100)/100;}
function quoteVenuePrice(pricePlans=[],input={}){
  const campus=String(input.campus||'').trim();
  const ds=dateKey(input.date||input.startTime);
  const dateType=String(input.dateType||'').trim()||priceDateType(ds);
  const start=clockMin(input.startTime);
  const end=clockMin(input.endTime);
  if(!campus)throw new Error('请选择校区');
  if(!ds)throw new Error('请选择日期');
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw new Error('请填写有效时间段');
  const candidates=(pricePlans||[]).filter(plan=>{
    if(plan?.type!=='venue_rate'||plan.status==='inactive')return false;
    if(String(plan.campus||'').trim()!==campus)return false;
    if(String(plan.dateType||'').trim()!==dateType)return false;
    if(plan.effectiveFrom&&ds<plan.effectiveFrom)return false;
    if(plan.effectiveTo&&ds>plan.effectiveTo)return false;
    return true;
  }).sort((a,b)=>clockMin(a.startTime)-clockMin(b.startTime));
  let cursor=start;
  const segments=[];
  while(cursor<end){
    const hit=candidates.find(plan=>{
      const ps=clockMin(plan.startTime),pe=clockMin(plan.endTime);
      return Number.isFinite(ps)&&Number.isFinite(pe)&&cursor>=ps&&cursor<pe;
    });
    if(!hit)throw new Error('未找到匹配的场地价格');
    const segmentEnd=Math.min(end,clockMin(hit.endTime));
    const hours=(segmentEnd-cursor)/60;
    const amount=roundMoney(hours*normalizeMoney(hit.unitPrice));
    segments.push({pricePlanId:hit.id,startTime:minToClock(cursor),endTime:minToClock(segmentEnd),unitPrice:normalizeMoney(hit.unitPrice),amount});
    cursor=segmentEnd;
  }
  const originalAmount=roundMoney(segments.reduce((sum,row)=>sum+row.amount,0));
  const rawDiscount=parseFloat(input.memberDiscount);
  const memberDiscount=Number.isFinite(rawDiscount)&&rawDiscount>0?rawDiscount:1;
  const systemAmount=roundMoney(originalAmount*memberDiscount);
  return {pricePlanIds:[...new Set(segments.map(s=>s.pricePlanId))],dateType,systemAmount,originalAmount,memberDiscount,segments};
}
function minToClock(min){
  return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`;
}
function hasMoneyValue(value){
  return value!==undefined&&value!==null&&String(value).trim()!=='';
}
const MEMBERSHIP_BENEFIT_FIELD_MAP=[
  {field:'publicLessonCount',code:'publicLesson',label:'大师公开课'},
  {field:'stringingLaborCount',code:'stringingLabor',label:'穿线免手工费'},
  {field:'ballMachineCount',code:'ballMachine',label:'发球机免费'},
  {field:'level2PartnerCount',code:'level2Partner',label:'国家二级运动员陪打'},
  {field:'designatedCoachPartnerCount',code:'designatedCoachPartner',label:'指定教练陪打'}
];
function normalizeMembershipBenefitTemplate(input={},fallbackTemplate={}){
  const rawTemplate=input?.benefitTemplate&&typeof input.benefitTemplate==='object'?input.benefitTemplate:{};
  const fallback=fallbackTemplate&&typeof fallbackTemplate==='object'?fallbackTemplate:{};
  const template={};
  MEMBERSHIP_BENEFIT_FIELD_MAP.forEach(({field,code,label})=>{
    const count=parseInt(
      input?.[field]??
      rawTemplate?.[code]?.count??
      fallback?.[code]?.count??
      0
    )||0;
    if(count<=0)return;
    template[code]={
      label,
      unit:'次',
      count
    };
    if(code==='designatedCoachPartner'){
      const designatedCoachIds=[...new Set(parseArr(
        input?.designatedCoachIds??
        rawTemplate?.[code]?.designatedCoachIds??
        fallback?.[code]?.designatedCoachIds
      ).map(x=>String(x||'').trim()).filter(Boolean))];
      if(designatedCoachIds.length)template[code].designatedCoachIds=designatedCoachIds;
    }
  });
  const customBenefits=parseArr(input?.customBenefits??rawTemplate?.customBenefits??fallback?.customBenefits).map(item=>{
    const count=parseInt(item?.count)||0;
    if(count<=0)return null;
    return {
      label:String(item?.label||'').trim()||'自定义权益',
      unit:String(item?.unit||'次').trim()||'次',
      count
    };
  }).filter(Boolean);
  if(customBenefits.length)template.customBenefits=customBenefits;
  return template;
}
function hasMembershipBenefitSnapshot(value){
  return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length>0;
}
function addMonthsKey(ds,months){
  const [y,m,d0]=String(ds||'').slice(0,10).split('-').map(n=>parseInt(n)||0);
  const d=new Date(Date.UTC(y,m-1,d0));
  d.setUTCMonth(d.getUTCMonth()+(parseInt(months)||0));
  d.setUTCDate(d.getUTCDate()-1);
  return d.toISOString().slice(0,10);
}
function normalizeStudentIds(input){
  const ids=Array.isArray(input.studentIds)?input.studentIds:(input.studentId?[input.studentId]:[]);
  return [...new Set(ids.map(x=>String(x||'').trim()).filter(Boolean))];
}
function extractDepositAmountFromText(text){
  const raw=String(text||'');
  const m=raw.match(/已储值\s*([0-9]+(?:\.[0-9]+)?)/);
  return m?normalizeMoney(m[1]):0;
}
function normalizeFinancePriceSnapshot(row){
  const hasSnapshot=row.priceMode||row.pricePlanId||row.systemAmount!==undefined||row.finalAmount!==undefined;
  if(!hasSnapshot)return row;
  const systemAmount=normalizeMoney(row.systemAmount);
  const finalAmount=normalizeMoney(row.finalAmount!==undefined?row.finalAmount:row.amount);
  const priceOverridden=systemAmount>0&&finalAmount>0&&systemAmount!==finalAmount;
  const overrideReason=String(row.overrideReason||'').trim();
  if(priceOverridden&&!overrideReason)throw new Error('请填写改价原因');
  return {
    ...row,
    priceMode:String(row.priceMode||'manual').trim(),
    pricePlanId:String(row.pricePlanId||'').trim(),
    channel:String(row.channel||'').trim(),
    channelOrderNo:String(row.channelOrderNo||'').trim(),
    redeemCode:String(row.redeemCode||'').trim(),
    systemAmount,
    finalAmount,
    amount:finalAmount||normalizeMoney(row.amount),
    priceOverridden,
    overrideReason,
    memberDiscount:normalizeMoney(row.memberDiscount||1)||1
  };
}
function courtFinanceRevenueBucket(row){
  if(row?.category==='内部占用')return '内部占用';
  if(row?.category!=='订场')return '';
  const method=String(row?.payMethod||'').trim();
  if(method==='储值扣款')return '储值扣款';
  if(method==='代用户订场')return '代用户订场';
  return '现场收款';
}
function normalizeCourtHistory(history){
  if(!Array.isArray(history))return[];
  return history.map((h)=> {
    const priced=normalizeFinancePriceSnapshot(h);
    const amountRaw=normalizeMoney(priced.amount);
    const type=h.type||'消费';
    const payMethod=h.payMethod||(type==='消费'&&amountRaw<0?'储值扣款':'');
    const revenueBucket=courtFinanceRevenueBucket({...priced,type,payMethod});
    const isInternalOccupancy=type==='消费'&&priced.category==='内部占用';
    const recordedAt=String(priced.recordedAt||priced.createdAt||'').trim();
    const occurredDate=String(priced.occurredDate||priced.date||'').slice(0,10);
    return {
      ...priced,
      type,
      payMethod,
      category:priced.category||'其他',
      studentId:priced.studentId||'',
      amount:isInternalOccupancy?0:Math.abs(amountRaw),
      bonusAmount:normalizeMoney(priced.bonusAmount),
      ...(occurredDate&&recordedAt?{occurredDate}:{}),
      ...(recordedAt?{recordedAt}:{}),
      ...(revenueBucket?{revenueBucket}:{})
    };
  });
}
function isMembershipExpiryClearRow(row){
  return row?.type==='冲正'&&row?.category==='会员到期清零';
}
function computeCourtFinance(input){
  const history=normalizeCourtHistory(input.history);
  if(!history.length){
    return {
      balance:normalizeMoney(input.balance),
      totalDeposit:normalizeMoney(input.totalDeposit),
      spentAmount:normalizeMoney(input.spentAmount),
      receivedAmount:normalizeMoney(input.receivedAmount!=null?input.receivedAmount:input.totalDeposit),
      storedValueSpent:normalizeMoney(input.storedValueSpent),
      directPaidSpent:normalizeMoney(input.directPaidSpent)
    };
  }
  const totals={balance:0,totalDeposit:0,spentAmount:0,receivedAmount:0,storedValueSpent:0,directPaidSpent:0};
  for(const h of history){
    const amount=normalizeMoney(h.amount);
    const bonus=normalizeMoney(h.bonusAmount);
    if(h.type==='消费'&&h.category==='内部占用')continue;
    if(amount<=0)throw new Error('流水金额必须大于0');
    if(h.type==='充值'){
      totals.totalDeposit+=amount;
      totals.receivedAmount+=amount;
      totals.balance+=amount+bonus;
      continue;
    }
    if(h.type==='消费'){
      totals.spentAmount+=amount;
      if(h.payMethod==='储值扣款'){
        totals.storedValueSpent+=amount;
        totals.balance-=amount;
        if(totals.balance<0)throw new Error('余额不足，不能使用储值扣款');
      }else{
        totals.directPaidSpent+=amount;
        totals.receivedAmount+=amount;
      }
      continue;
    }
    if(h.type==='退款'){
      if(h.payMethod==='储值退款'){
        totals.balance-=amount;
        if(totals.balance<0)throw new Error('余额不足，不能退款');
      }
      totals.receivedAmount-=amount;
      if(totals.receivedAmount<0)throw new Error('退款金额超过累计实收');
      continue;
    }
    if(h.type==='冲正'){
      if(isMembershipExpiryClearRow(h)){
        totals.balance-=amount;
        if(totals.balance<0)throw new Error('余额不足，不能执行会员到期清零');
        continue;
      }
      totals.spentAmount-=amount;
      if(totals.spentAmount<0)throw new Error('冲正金额超过累计消费');
      if(h.payMethod==='储值扣款'){
        totals.storedValueSpent-=amount;
        if(totals.storedValueSpent<0)throw new Error('冲正金额超过储值扣款消费');
        totals.balance+=amount;
      }else{
        totals.directPaidSpent-=amount;
        if(totals.directPaidSpent<0)throw new Error('冲正金额超过单次支付消费');
        totals.receivedAmount-=amount;
        if(totals.receivedAmount<0)throw new Error('冲正金额超过累计实收');
      }
      continue;
    }
  }
  Object.keys(totals).forEach(k=>{totals[k]=Math.round(totals[k]*100)/100;});
  return totals;
}
function summarizeCourtFinanceRevenue(input){
  const history=normalizeCourtHistory(input?.history||[]);
  const summary={
    storedValueBooking:0,
    onsiteBooking:0,
    proxyBooking:0,
    matchBooking:0,
    internalOccupancyCount:0,
    internalOccupancyAmount:0,
    cashReceived:0,
    confirmedRevenue:0,
    pendingRevenue:0,
    bookingUsageAmount:0,
    paidBookingCount:0
  };
  for(const h of history){
    if(!['消费','退款','冲正'].includes(h.type))continue;
    const amount=normalizeMoney(h.amount);
    if(h.category==='内部占用'){
      if(h.type!=='消费')continue;
      summary.internalOccupancyCount+=1;
      continue;
    }
    if(h.category!=='订场')continue;
    const direction=h.type==='消费'?1:-1;
    const bucket=h.revenueBucket||courtFinanceRevenueBucket(h);
    const signedAmount=amount*direction;
    if(h.type==='消费')summary.paidBookingCount+=1;
    if(h.sourceCategory==='约球订场')summary.matchBooking+=signedAmount;
    if(bucket==='储值扣款')summary.storedValueBooking+=signedAmount;
    else if(bucket==='代用户订场')summary.proxyBooking+=signedAmount;
    else summary.onsiteBooking+=signedAmount;
  }
  summary.cashReceived=summary.onsiteBooking+summary.proxyBooking;
  summary.confirmedRevenue=summary.storedValueBooking+summary.onsiteBooking;
  summary.pendingRevenue=summary.proxyBooking;
  summary.bookingUsageAmount=summary.storedValueBooking+summary.onsiteBooking+summary.proxyBooking;
  Object.keys(summary).forEach(k=>{summary[k]=Math.round(summary[k]*100)/100;});
  return summary;
}
function isoDateKey(value){
  const raw=String(value||'').trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(raw))return raw.slice(0,10);
  const ms=Date.parse(raw);
  return Number.isNaN(ms)?'':new Date(ms).toISOString().slice(0,10);
}
function matchFinanceRowDate(row){
  const rawPrimary=String(row.occurredDate||row.date||'').trim();
  const primary=/^\d{4}-\d{2}-\d{2}/.test(rawPrimary)?isoDateKey(rawPrimary):'';
  if(primary)return primary;
  return isoDateKey(row.recordedAt||row.createdAt);
}
function buildMatchFinanceDailyReport({date=new Date().toISOString().slice(0,10),feeSplits=[],financeHistory=[]}={}){
  const target=isoDateKey(date)||new Date().toISOString().slice(0,10);
  const summary={receivable:0,paid:0,pending:0,waived:0,abnormal:0,refunded:0,ledgerIncome:0,ledgerRefund:0,ledgerNet:0,expectedNet:0,diff:0};
  const splitRows=(feeSplits||[]).filter(row=>isoDateKey(row.updatedAt||row.updatedat||row.paidAt||row.paidat||row.createdAt||row.createdat)===target);
  for(const split of splitRows){
    const amount=normalizeMoney(split.amount);
    const paidAmount=normalizeMoney(split.paidAmount||split.paidamount||amount);
    const status=split.payStatus||split.paystatus||'pending';
    summary.receivable+=amount;
    if(status==='paid'||status==='refunded')summary.paid+=paidAmount;
    else if(status==='waived')summary.waived+=amount;
    else if(status==='abnormal'||status==='bad_debt')summary.abnormal+=amount;
    else summary.pending+=amount;
  }
  const ledgerRows=normalizeCourtHistory(financeHistory).filter(row=>row.sourceCategory==='约球订场'&&row.category==='订场'&&matchFinanceRowDate(row)===target);
  for(const row of ledgerRows){
    const amount=normalizeMoney(row.amount);
    if(row.type==='消费')summary.ledgerIncome+=amount;
    if(row.type==='退款')summary.ledgerRefund+=amount;
  }
  summary.refunded=summary.ledgerRefund;
  summary.ledgerNet=summary.ledgerIncome-summary.ledgerRefund;
  summary.expectedNet=summary.paid-summary.refunded;
  summary.diff=summary.expectedNet-summary.ledgerNet;
  Object.keys(summary).forEach(key=>summary[key]=Math.round(summary[key]*100)/100);
  return {date:target,summary,feeSplits:splitRows,ledgerRows};
}
async function getMatchFinanceDailyReportForAdmin(date=new Date().toISOString().slice(0,10)){
  const pool=getMatchSqlPool();
  const target=isoDateKey(date)||new Date().toISOString().slice(0,10);
  const splits=await pool.query(`
    SELECT s.*,u.nickName,u.phone,p.title,p.startTime,p.venueName
    FROM match_fee_splits s
    LEFT JOIN match_users u ON u.id=s.userId
    LEFT JOIN match_posts p ON p.id=s.matchId
    WHERE DATE(COALESCE(s.updatedAt,s.paidAt,s.createdAt))=$1::date
    ORDER BY s.updatedAt DESC
  `,[target]);
  const financeAccount=await getCachedRow(T_COURTS,MATCH_COURT_FINANCE_ACCOUNT_ID).catch(()=>null);
  return buildMatchFinanceDailyReport({date:target,feeSplits:splits.rows,financeHistory:financeAccount?.history||[]});
}
function matchClockText(value){
  const raw=String(value||'');
  if(!raw)return '';
  const m=raw.replace('T',' ').match(/\s(\d{2}:\d{2})/);
  return m?m[1]:raw.slice(11,16);
}
function matchDateText(value){
  const raw=String(value||'');
  return raw.slice(0,10);
}
function buildMatchCourtFinanceHistoryRow({match={},split={},user={},operatorId='',now=new Date().toISOString()}={}){
  const amount=normalizeMoney(split.amount||split.paidAmount);
  if(amount<=0)throw new Error('约球收款金额必须大于 0');
  const start=match.starttime||match.startTime;
  const end=match.endtime||match.endTime;
  const title=String(match.title||'约球').trim();
  const payer=String(user.nickName||user.nickname||user.phone||user.id||split.userId||split.userid||'球友').trim();
  return {
    id:`match-fee-${split.id||uuidv4()}`,
    date:matchDateText(start)||String(now).slice(0,10),
    occurredDate:matchDateText(start)||String(now).slice(0,10),
    createdAt:now,
    recordedAt:now,
    type:'消费',
    category:'订场',
    sourceCategory:'约球订场',
    payMethod:'微信转账',
    amount,
    note:`约球订场 - ${title} - ${payer}`,
    startTime:matchClockText(start),
    endTime:matchClockText(end),
    venue:match.venuename||match.venueName||'',
    campus:match.campus||'',
    revenueBucket:'现场收款',
    priceMode:'manual',
    systemAmount:amount,
    finalAmount:amount,
    priceOverridden:false,
    overrideReason:'',
    matchId:match.id||split.matchId||split.matchid||'',
    matchFeeSplitId:split.id||'',
    matchUserId:split.userid||split.userId||user.id||'',
    operator:operatorId
  };
}
function buildMatchCourtFinanceRefundRow({paidRow={},split={},operatorId='',note='',now=new Date().toISOString()}={}){
  const amount=normalizeMoney(split.paidAmount||split.paidamount||split.amount||paidRow.amount);
  if(amount<=0)throw new Error('约球退款金额必须大于 0');
  return {
    ...paidRow,
    id:`match-fee-refund-${split.id||uuidv4()}`,
    createdAt:now,
    recordedAt:now,
    type:'退款',
    category:'订场',
    sourceCategory:'约球订场',
    payMethod:paidRow.payMethod||'微信转账',
    revenueBucket:paidRow.revenueBucket||'现场收款',
    amount,
    note:`约球订场退款 - ${String(note||'运营退款').trim()}`,
    matchFeeSplitId:split.id||paidRow.matchFeeSplitId||'',
    matchUserId:split.userid||split.userId||paidRow.matchUserId||'',
    operator:operatorId
  };
}
async function syncMatchFeeSplitToCourtFinance(matchId,userId,operatorId){
  const pool=getMatchSqlPool();
  const [matchRes,splitRes,userRes]=await Promise.all([
    pool.query('SELECT * FROM match_posts WHERE id=$1',[matchId]),
    pool.query('SELECT * FROM match_fee_splits WHERE matchId=$1 AND userId=$2',[matchId,userId]),
    pool.query('SELECT * FROM match_users WHERE id=$1',[userId])
  ]);
  const match=matchRes.rows[0];
  const split=splitRes.rows[0];
  if(!match||!split||String(split.paystatus||split.payStatus)!=='paid')return {synced:false};
  const now=new Date().toISOString();
  const existing=await getCachedRow(T_COURTS,MATCH_COURT_FINANCE_ACCOUNT_ID).catch(()=>null);
  const base=existing||{
    id:MATCH_COURT_FINANCE_ACCOUNT_ID,
    name:'约球订场',
    phone:'',
    campus:'',
    status:'active',
    history:[],
    createdAt:now
  };
  const history=normalizeCourtHistory(base.history);
  if(history.some(row=>String(row.matchFeeSplitId||'')===String(split.id)))return {synced:true,skipped:true};
  const row=buildMatchCourtFinanceHistoryRow({match,split,user:userRes.rows[0]||{},operatorId,now});
  const next=normalizeCourtRecord({...base,history:[...history,row],updatedAt:now});
  await put(T_COURTS,MATCH_COURT_FINANCE_ACCOUNT_ID,next);
  return {synced:true,historyId:row.id};
}
async function syncMatchFeeSplitRefundToCourtFinance(matchId,userId,operatorId,note=''){
  const pool=getMatchSqlPool();
  const splitRes=await pool.query('SELECT * FROM match_fee_splits WHERE matchId=$1 AND userId=$2',[matchId,userId]);
  const split=splitRes.rows[0];
  if(!split||String(split.paystatus||split.payStatus)!=='refunded')return {synced:false};
  const now=new Date().toISOString();
  const existing=await getCachedRow(T_COURTS,MATCH_COURT_FINANCE_ACCOUNT_ID).catch(()=>null);
  if(!existing)return {synced:false,error:'match court finance account missing'};
  const history=normalizeCourtHistory(existing.history);
  const splitId=String(split.id||'');
  if(history.some(row=>String(row.id||'')===`match-fee-refund-${splitId}`))return {synced:true,skipped:true};
  const paidRow=history.find(row=>String(row.matchFeeSplitId||'')===splitId&&row.type==='消费');
  if(!paidRow)throw new Error('未找到原收款流水，不能退款');
  const row=buildMatchCourtFinanceRefundRow({paidRow,split,operatorId,note,now});
  const next=normalizeCourtRecord({...existing,history:[...history,row],updatedAt:now});
  await put(T_COURTS,MATCH_COURT_FINANCE_ACCOUNT_ID,next);
  return {synced:true,historyId:row.id};
}
async function getCourtRecordForTest(id){
  return getCachedRow(T_COURTS,id);
}
async function removeMatchCourtFinanceRowsForTest(matchIdPrefix){
  const account=await getCachedRow(T_COURTS,MATCH_COURT_FINANCE_ACCOUNT_ID).catch(()=>null);
  if(!account)return {removed:0};
  const history=normalizeCourtHistory(account.history);
  const prefix=String(matchIdPrefix||'');
  const nextHistory=history.filter(row=>{
    const haystack=[row.matchId,row.note,row.matchUserId,row.id].map(x=>String(x||'')).join(' ');
    return !haystack.includes(prefix);
  });
  const removed=history.length-nextHistory.length;
  if(removed>0){
    const next=normalizeCourtRecord({...account,history:nextHistory,updatedAt:new Date().toISOString()});
    await put(T_COURTS,MATCH_COURT_FINANCE_ACCOUNT_ID,next);
  }
  return {removed};
}
function classStatusToPlanStatus(status){
  return status==='已取消'?'已取消':status==='已结课'?'已结课':'active';
}
function buildClassPlanRecord(cls,student){
  return {
    classId:cls.id,
    studentId:student?.id||'',
    studentName:student?.name||student?.id||'',
    studentPhone:student?.phone||'',
    className:cls.className||'',
    productName:cls.productName||'',
    coach:cls.coach||'',
    campus:cls.campus||'',
    totalLessons:parseLessonValue(cls.totalLessons),
    usedLessons:parseLessonValue(cls.usedLessons),
    status:classStatusToPlanStatus(cls.status)
  };
}
function assertPlanWriteForbidden(method){
  if(String(method||'').toUpperCase()==='GET')return;
  throw new Error('学习计划由班次自动生成，不能独立新增、修改或删除');
}
function assertCanDeleteProduct(productId,classes,packages=[]){
  if((classes||[]).some(c=>c.productId===productId))throw new Error('该课程产品已有班次使用，不能删除');
  if((packages||[]).some(p=>p.productId===productId))throw new Error('该课程产品已有售卖课包使用，不能删除');
}
function assertCanDeleteClass(classId,schedules){
  if((schedules||[]).some(s=>s.classId===classId))throw new Error('该班次已有排课，不能删除');
}
function assertCanDeletePackage(packageId,purchases){
  if((purchases||[]).some(p=>p.packageId===packageId))throw new Error('该课包已有购买记录，不能删除，请停用');
}
function assertCanVoidPurchase(purchaseId,entitlements,ledger){
  const entitlementIds=new Set((entitlements||[]).filter(e=>e.purchaseId===purchaseId).map(e=>e.id));
  if((ledger||[]).some(l=>entitlementIds.has(l.entitlementId)))throw new Error('该购买记录已有课时消耗，不能直接作废');
}
function assertCanDeleteEntitlement(entitlementId,ledger,entitlements=[]){
  if((ledger||[]).some(l=>l.entitlementId===entitlementId))throw new Error('该课包余额已有消耗记录，不能删除');
  if((entitlements||[]).some(e=>e.id===entitlementId&&e.purchaseId))throw new Error('该课包余额来自购买记录，不能删除');
}
function sameStudentIds(a,b){
  const x=parseArr(a).filter(Boolean).sort();
  const y=parseArr(b).filter(Boolean).sort();
  return x.length===y.length&&x.every((id,i)=>id===y[i]);
}
function classRemainingLessonsForRecord(cls){
  return parseLessonValue(cls?.totalLessons)-parseLessonValue(cls?.usedLessons);
}
function assertCanWriteClass(user){
  if(user?.role!=='admin')throw new Error('无权限');
}
function nextClassNoFromClasses(classes){
  const nums=(classes||[]).map(c=>{
    const m=String(c?.classNo||'').match(/^CLS(\d+)$/);
    return m?parseInt(m[1]):0;
  });
  const next=(nums.length?Math.max(...nums):0)+1;
  return 'CLS'+String(next).padStart(4,'0');
}
function isClassNoReservationConflict(err){
  return /condition|expect|exist|OTSConditionCheckFail|ConditionCheck/i.test(String(err?.code||'')+' '+String(err?.message||err||''));
}
async function reserveNextClassNo(existingClasses,user,now){
  let base=existingClasses||[];
  for(let attempt=0;attempt<8;attempt++){
    const classNo=nextClassNoFromClasses(base);
    try{
      await putIfAbsent(T_CLASS_NOS,classNo,{id:classNo,classNo,createdBy:user?.name||'',createdAt:now});
      return classNo;
    }catch(err){
      if(isTableMissingError(err)){await mkTable(T_CLASS_NOS);continue;}
      if(!isClassNoReservationConflict(err))throw err;
      base=await scan(T_CLASSES).catch(()=>base);
      base=[...base,{classNo}];
    }
  }
  throw new Error('班次编号生成失败，请重试');
}
function validateClassInput(input,product){
  if(!input?.productId)throw new Error('请选择课程产品');
  const total=parseLessonValue(input.totalLessons,Number.NaN);
  const used=parseLessonValue(input.usedLessons);
  if(Number.isNaN(total)||total<0)throw new Error('应上课时不能小于0');
  if(used<0)throw new Error('已上课时不能小于0');
  if(used>total)throw new Error('已上课时不能大于应上课时');
  const studentIds=parseArr(input.studentIds).filter(Boolean);
  const max=parseInt(product?.maxStudents)||0;
  if(max>0&&studentIds.length>max)throw new Error(`选择学员数超过课程产品人数上限：最多 ${max} 人`);
  if(input.startDate&&input.endDate&&String(input.endDate)<String(input.startDate))throw new Error('结束日期不能早于开始日期');
}
function buildClassCreateRecord(body,{id,classNo,user,now}){
  const productName=body.productName||'';
  return {
    ...body,
    id,
    classNo,
    className:classNo+'-'+productName,
    productName,
    studentIds:parseArr(body.studentIds),
    scheduleDays:parseArr(body.scheduleDays),
    totalLessons:parseLessonValue(body.totalLessons),
    usedLessons:0,
    status:body.status||'已排班',
    createdBy:user?.name||'',
    createdAt:now,
    updatedAt:now
  };
}
function buildClassUpdateRecord(oldClass,body,{product,now}){
  const classNo=oldClass?.classNo||body.classNo||'';
  const productName=product?.name||body.productName||oldClass?.productName||'';
  return {
    ...oldClass,
    ...body,
    id:oldClass?.id||body.id,
    classNo,
    className:classNo&&productName?classNo+'-'+productName:(body.className||oldClass?.className||''),
    productName,
    studentIds:parseArr(body.studentIds),
    scheduleDays:parseArr(body.scheduleDays),
    totalLessons:parseLessonValue(body.totalLessons),
    usedLessons:parseLessonValue(oldClass?.usedLessons),
    status:body.status||oldClass?.status||'已排班',
    updatedAt:now
  };
}
function firstNonEmptyText(...values){
  for(const value of values){
    const text=String(value??'').trim();
    if(text)return text;
  }
  return '';
}
function formatClassScheduleDaysText(days){
  const list=parseArr(days).map(item=>String(item||'').trim()).filter(Boolean);
  if(!list.length)return '';
  return `每${list.join('、')}`;
}
function formatClassScheduleTimeFromLesson(lesson){
  const start=String(lesson?.startTime||'').trim();
  const end=String(lesson?.endTime||'').trim();
  if(!start||!end)return '';
  const startDate=new Date(start.replace(' ','T'));
  const endDate=new Date(end.replace(' ','T'));
  if(Number.isNaN(startDate.getTime())||Number.isNaN(endDate.getTime()))return '';
  const weekDays=['周日','周一','周二','周三','周四','周五','周六'];
  const startText=`${String(startDate.getHours()).padStart(2,'0')}:${String(startDate.getMinutes()).padStart(2,'0')}`;
  const endText=`${String(endDate.getHours()).padStart(2,'0')}:${String(endDate.getMinutes()).padStart(2,'0')}`;
  return `${weekDays[startDate.getDay()]} ${startText} - ${endText}`;
}
function decorateWorkbenchClasses(classes,schedule){
  const lessons=Array.isArray(schedule)?schedule:[];
  return (Array.isArray(classes)?classes:[]).map(item=>{
    const classLessons=lessons
      .filter(lesson=>String(lesson?.status||'')!=='已取消')
      .filter(lesson=>String(lesson?.classId||'').trim()===String(item?.id||'').trim())
      .sort((a,b)=>String(a?.startTime||'').localeCompare(String(b?.startTime||'')));
    const scheduleTime=firstNonEmptyText(
      classLessons[0]&&formatClassScheduleTimeFromLesson(classLessons[0]),
      formatClassScheduleDaysText(item?.scheduleDays)
    );
    return {
      ...item,
      courseContent:firstNonEmptyText(item?.courseContent,item?.productName),
      scheduleTime:scheduleTime,
      campus:firstNonEmptyText(item?.campus,item?.campusName),
      remark:firstNonEmptyText(item?.remark,item?.opsNote)
    };
  });
}
function workbenchLessonUnits(schedule){
  const count=parseLessonValue(schedule?.lessonCount);
  if(count>0)return count;
  const start=dateMs(schedule?.startTime);
  const end=dateMs(schedule?.endTime);
  if(Number.isFinite(start)&&Number.isFinite(end)&&end>start)return Math.max(0,(end-start)/3600000);
  return 1;
}
function decorateWorkbenchStudents(students=[],schedule=[],now=new Date()){
  const lessons=Array.isArray(schedule)?schedule:[];
  return (Array.isArray(students)?students:[]).map(item=>({
    ...item,
    phone:firstNonEmptyText(item?.phone,item?.mobile,item?.phoneNumber),
    type:firstNonEmptyText(item?.type,item?.studentType,item?.category),
    campus:firstNonEmptyText(item?.campus,item?.campusName,item?.primaryCampus),
    primaryCoach:firstNonEmptyText(item?.primaryCoach,item?.coachName),
    ownerCoach:firstNonEmptyText(item?.ownerCoach,item?.saleCoach,item?.salesCoach),
    remark:firstNonEmptyText(item?.remark,item?.studentRemark,item?.note,item?.notes),
    historyIssue:firstNonEmptyText(item?.historyIssue,item?.issueHistory,item?.issueNote,item?.healthNote),
    focusNote:firstNonEmptyText(item?.focusNote,item?.sessionFocus),
    lessonUnitsCompleted:lessons
      .filter(lesson=>effectiveScheduleStatus(lesson,now)==='已结束')
      .filter(lesson=>parseArr(lesson?.studentIds).includes(item?.id)||String(lesson?.studentId||'')===String(item?.id||''))
      .reduce((sum,lesson)=>sum+workbenchLessonUnits(lesson),0)
  }));
}
function decorateWorkbenchFeedbacks(feedbacks=[]){
  return (Array.isArray(feedbacks)?feedbacks:[]).map(item=>({
    ...item,
    focusNote:firstNonEmptyText(item?.focusNote,item?.sessionFocus,item?.coachFocus,item?.coachNote),
    summary:firstNonEmptyText(item?.summary,item?.practicedToday)
  }));
}
function assertCanEditClassWithSchedules(oldClass,nextClass,schedules){
  const classSchedules=(schedules||[]).filter(s=>s.classId===oldClass?.id);
  if(!classSchedules.length)return;
  if(String(oldClass?.productId||'').trim()!==String(nextClass?.productId||'').trim())throw new Error('该班次已有排课，不能直接修改课程产品');
  if(String(oldClass?.coach||'').trim()!==String(nextClass?.coach||'').trim())throw new Error('该班次已有排课，不能直接修改教练');
  if(String(oldClass?.campus||'').trim()!==String(nextClass?.campus||'').trim())throw new Error('该班次已有排课，不能直接修改校区');
  if(!sameStudentIds(oldClass?.studentIds,nextClass?.studentIds))throw new Error('该班次已有排课，不能直接修改学员');
  if(parseLessonValue(oldClass?.totalLessons)!==parseLessonValue(nextClass?.totalLessons))throw new Error('该班次已有排课，不能直接修改总课时');
  if(parseLessonValue(oldClass?.usedLessons)!==parseLessonValue(nextClass?.usedLessons))throw new Error('已上课时由排课自动维护，不能手动修改');
  const oldStatus=oldClass?.status||'已排班',nextStatus=nextClass?.status||'已排班';
  if(oldStatus!==nextStatus&&nextStatus==='已取消')throw new Error('该班次已有排课，不能直接取消');
  if(oldStatus!==nextStatus&&nextStatus==='已结课'&&classRemainingLessonsForRecord(nextClass)>0)throw new Error('该班次仍有剩余课时，不能直接结课');
}
function assertCanDeleteSchedule(scheduleId,feedbacks,ledger=[]){
  if((feedbacks||[]).some(f=>f.scheduleId===scheduleId))throw new Error('该排课已有课后反馈，不能直接删除');
  if((ledger||[]).some(l=>l.scheduleId===scheduleId))throw new Error('该排课已有权益消耗记录，不能直接删除，请取消排课');
}
function assertCanDeleteStudent(studentId,data){
  if(!studentId)return;
  const reasons=[];
  if((data.classes||[]).some(c=>parseArr(c.studentIds).includes(studentId)))reasons.push('班次');
  if((data.schedule||[]).some(s=>parseArr(s.studentIds).includes(studentId)))reasons.push('排课');
  if((data.plans||[]).some(p=>p.studentId===studentId))reasons.push('学习计划');
  if((data.purchases||[]).some(p=>p.studentId===studentId))reasons.push('购买记录');
  if((data.entitlements||[]).some(e=>e.studentId===studentId))reasons.push('课包余额');
  if((data.entitlementLedger||[]).some(l=>l.studentId===studentId))reasons.push('扣课记录');
  if((data.courts||[]).some(c=>c.studentId===studentId||parseArr(c.studentIds).includes(studentId)||normalizeCourtHistory(c.history).some(h=>h.studentId===studentId)))reasons.push('订场账户');
  if((data.feedbacks||[]).some(f=>f.studentId===studentId||parseArr(f.studentIds).includes(studentId)))reasons.push('课后反馈');
  if(reasons.length)throw new Error(`该学员不能直接删除：已关联${[...new Set(reasons)].join('、')}`);
}
function assertStudentWriteAccess(user){
  if(user?.role!=='admin')throw new Error('无权限');
}
function assertCanDeleteCourt(court,data={}){
  const reasons=[];
  if(parseArr(court?.history).length)reasons.push('已存在财务流水');
  if(normalizeMoney(court?.balance)||normalizeMoney(court?.totalDeposit)||normalizeMoney(court?.spentAmount))reasons.push('仍有财务余额或累计金额');
  const courtId=String(court?.id||'').trim();
  if(courtId){
    if((data.membershipAccounts||[]).some(r=>String(r.courtId||'').trim()===courtId))reasons.push('已关联会员账户');
    if((data.membershipOrders||[]).some(r=>String(r.courtId||'').trim()===courtId))reasons.push('已关联会员订单');
    if((data.membershipBenefitLedger||[]).some(r=>String(r.courtId||'').trim()===courtId))reasons.push('已关联权益流水');
    if((data.membershipAccountEvents||[]).some(r=>String(r.courtId||'').trim()===courtId))reasons.push('已关联账户事件');
  }
  if(reasons.length)throw new Error(`该客户不能直接删除：${[...new Set(reasons)].join('、')}`);
}
function courtDeleteAction(court,data={}){
  try{
    assertCanDeleteCourt(court,data);
    return 'delete';
  }catch(e){
    return 'archive';
  }
}
function mergeCourtNotes(targetCourt,sourceCourt){
  const targetNotes=String(targetCourt?.notes||'').trim();
  const sourceNotes=String(sourceCourt?.notes||'').trim();
  const sourceMark=`[合并自 ${sourceCourt?.name||'原用户'} · ${sourceCourt?.id||''}]`;
  if(!sourceNotes)return [targetNotes,sourceMark].filter(Boolean).join('\n');
  return [targetNotes,`${sourceMark} ${sourceNotes}`].filter(Boolean).join('\n');
}
function mergeCourtRecords({targetCourt,sourceCourt,membershipAccounts=[],membershipOrders=[],membershipBenefitLedger=[],membershipAccountEvents=[],now=new Date().toISOString()}={}){
  if(!targetCourt?.id||!sourceCourt?.id)throw new Error('请选择要合并的订场用户');
  if(String(targetCourt.id)===String(sourceCourt.id))throw new Error('不能合并到自己');
  const targetActiveAccount=(membershipAccounts||[]).find(row=>String(row.courtId||'')===String(targetCourt.id)&&row.status!=='voided');
  const sourceActiveAccount=(membershipAccounts||[]).find(row=>String(row.courtId||'')===String(sourceCourt.id)&&row.status!=='voided');
  if(targetActiveAccount&&sourceActiveAccount)throw new Error('两个订场用户都已有会员账户，当前暂不支持直接合并，请先处理会员账户');
  const mergedStudentIds=[...new Set([...normalizeStudentIds(targetCourt),...normalizeStudentIds(sourceCourt)])];
  const mergedHistory=[...buildLegacyCourtOpeningHistory(targetCourt),...buildLegacyCourtOpeningHistory(sourceCourt)];
  const mergedTarget=normalizeCourtRecord({
    ...sourceCourt,
    ...targetCourt,
    id:targetCourt.id,
    name:targetCourt.name||sourceCourt.name||'',
    phone:targetCourt.phone||sourceCourt.phone||'',
    campus:targetCourt.campus||sourceCourt.campus||'',
    joinDate:targetCourt.joinDate||sourceCourt.joinDate||'',
    recentFollowUpDate:targetCourt.recentFollowUpDate||sourceCourt.recentFollowUpDate||'',
    nextFollowUpDate:targetCourt.nextFollowUpDate||sourceCourt.nextFollowUpDate||'',
    owner:targetCourt.owner||sourceCourt.owner||'',
    depositAttitude:targetCourt.depositAttitude||sourceCourt.depositAttitude||'',
    familiarity:targetCourt.familiarity||sourceCourt.familiarity||'',
    notes:mergeCourtNotes(targetCourt,sourceCourt),
    studentId:mergedStudentIds[0]||'',
    studentIds:mergedStudentIds,
    status:'active',
    history:mergedHistory,
    updatedAt:now
  });
  const rewriteCourtLink=row=>({...row,courtId:targetCourt.id,courtName:mergedTarget.name||targetCourt.name||targetCourt.id,phone:mergedTarget.phone||'',studentIds:mergedStudentIds,updatedAt:now});
  return {
    targetCourt:mergedTarget,
    sourceCourt:{...sourceCourt,status:'inactive',mergedIntoCourtId:targetCourt.id,mergedAt:now,updatedAt:now},
    membershipAccounts:(membershipAccounts||[]).map(row=>String(row.courtId||'')===String(sourceCourt.id)?rewriteCourtLink(row):row),
    membershipOrders:(membershipOrders||[]).map(row=>String(row.courtId||'')===String(sourceCourt.id)?rewriteCourtLink(row):row),
    membershipBenefitLedger:(membershipBenefitLedger||[]).map(row=>String(row.courtId||'')===String(sourceCourt.id)?rewriteCourtLink(row):row),
    membershipAccountEvents:(membershipAccountEvents||[]).map(row=>String(row.courtId||'')===String(sourceCourt.id)?rewriteCourtLink(row):row)
  };
}
function assertCanDeleteCampus(campusId,data={}){
  const id=String(campusId||'').trim();
  if(!id)return;
  const used=
    (data.students||[]).some(r=>String(r.campus||'').trim()===id)||
    (data.coaches||[]).some(r=>String(r.campus||'').trim()===id)||
    (data.classes||[]).some(r=>String(r.campus||'').trim()===id)||
    (data.schedule||[]).some(r=>String(r.campus||'').trim()===id)||
    (data.courts||[]).some(r=>String(r.campus||'').trim()===id)||
    (data.packages||[]).some(r=>parseArr(r.campusIds).some(c=>String(c||'').trim()===id))||
    (data.entitlements||[]).some(r=>parseArr(r.campusIds).some(c=>String(c||'').trim()===id));
  if(used)throw new Error('该校区已有学员、教练、班次、排课、课包或权益关联，不能直接删除');
}
function buildProductRenameDisplayUpdates(oldProduct,nextProduct,data={},now=new Date().toISOString()){
  const empty={classes:[],plans:[]};
  if(!oldProduct||!nextProduct)return empty;
  const oldName=String(oldProduct.name||'').trim();
  const nextName=String(nextProduct.name||'').trim();
  if(!oldName||!nextName||oldName===nextName)return empty;
  if(changedCoreFields(oldProduct,nextProduct,['type','maxStudents','lessons','price']).length)return empty;
  const classes=(data.classes||[]).filter(c=>c.productId===oldProduct.id).map(c=>{
    const className=c.classNo&&nextName?`${c.classNo}-${nextName}`:(nextName||c.className||'');
    return {...c,productName:nextName,className,updatedAt:now};
  });
  const classMap=new Map(classes.map(c=>[c.id,c]));
  const classIds=new Set(classes.map(c=>c.id));
  const plans=(data.plans||[]).filter(p=>classIds.has(p.classId)).map(p=>{
    const cls=classMap.get(p.classId)||null;
    return {...p,productName:nextName,className:cls?.className||p.className||'',updatedAt:now};
  });
  return {classes,plans};
}
async function syncClassPlans(classId,cls){
  const studentIds=parseArr(cls.studentIds);
  const [students,existingPlans]=await Promise.all([
    timed('sync class plans scan students',()=>getCachedScan(T_STUDENTS)),
    timed('sync class plans scan plans',()=>getCachedScan(T_PLANS))
  ]);
  const classPlans=existingPlans.filter(p=>p.classId===classId);
  const saved=[];
  for(const sid of studentIds){
    const student=students.find(s=>s.id===sid)||{id:sid,name:sid};
    const current=classPlans.find(p=>p.studentId===sid);
    const id=current?.id||uuidv4();
    const rec={...current,...buildClassPlanRecord({...cls,id:classId},student),id,updatedAt:new Date().toISOString()};
    if(!current)rec.createdAt=new Date().toISOString();
    await put(T_PLANS,id,rec);
    saved.push(rec);
  }
  for(const plan of classPlans.filter(p=>!studentIds.includes(p.studentId)&&p.status!=='已取消')){
    const rec={...plan,status:'已取消',updatedAt:new Date().toISOString()};
    await put(T_PLANS,plan.id,rec);
    saved.push(rec);
  }
  return saved;
}
function normalizeCourtRecord(input,refs={}){
  const inferredDeposit=extractDepositAmountFromText(input.depositAttitude);
  const normalizedInput={...input};
  if(inferredDeposit>0&&!normalizeMoney(normalizedInput.totalDeposit))normalizedInput.totalDeposit=inferredDeposit;
  if(inferredDeposit>0&&!hasMoneyValue(input.balance)){
    const spent=normalizeMoney(normalizedInput.spentAmount);
    const total=normalizeMoney(normalizedInput.totalDeposit);
    if(spent>0&&total>0)normalizedInput.balance=Math.max(0,total-spent);
  }
  const currentHistory=normalizeCourtHistory(input.history);
  const history=normalizeCourtBookingHistoryRows(normalizedInput,currentHistory.length?currentHistory:buildLegacyCourtOpeningHistory(normalizedInput));
  if(Array.isArray(refs.schedules))assertCourtBookingHistoryAgainstSchedules({...normalizedInput,history},refs.schedules);
  const finance=computeCourtFinance({...normalizedInput,history});
  const studentIds=normalizeStudentIds(normalizedInput);
  return {
    ...normalizedInput,
    phone:assertPhone(normalizedInput.phone),
    studentId:studentIds[0]||'',
    studentIds,
    history,
    ...finance
  };
}
function buildLegacyCourtOpeningHistory(court){
  const history=normalizeCourtHistory(court?.history);
  if(history.length||!court)return history;
  const total=normalizeMoney(court.totalDeposit);
  const balance=normalizeMoney(court.balance);
  const spent=normalizeMoney(court.spentAmount);
  const date=court.joinDate||new Date().toISOString().slice(0,10);
  const idBase=String(court.id||'legacy');
  const stored=Math.max(0,total-balance);
  const direct=Math.max(0,spent-stored);
  const rows=[];
  if(total>0)rows.push({id:'legacy-deposit-'+idBase,date,type:'充值',category:'历史储值',payMethod:'历史导入',amount:total,note:'期初导入汇总',source:'import'});
  if(stored>0)rows.push({id:'legacy-stored-spent-'+idBase,date,type:'消费',category:'历史消费',payMethod:'储值扣款',amount:stored,note:'期初导入汇总',source:'import'});
  if(direct>0)rows.push({id:'legacy-direct-spent-'+idBase,date,type:'消费',category:'历史消费',payMethod:'历史导入',amount:direct,note:'期初导入汇总',source:'import'});
  return rows;
}
function buildMembershipPlanRecord(input,opts={}){
  const now=opts.now||new Date().toISOString();
  if(!String(input?.name||'').trim())throw new Error('请填写会员方案名称');
  const rechargeAmount=normalizeMoney(input.rechargeAmount);
  if(rechargeAmount<=0)throw new Error('会员充值金额必须大于 0');
  const discountRate=normalizeMoney(input.discountRate||1);
  if(discountRate<=0||discountRate>1)throw new Error('会员折扣必须在 0 到 1 之间');
  const saleStartDate=String(input.saleStartDate||'').trim();
  const saleEndDate=String(input.saleEndDate||'').trim();
  if(saleStartDate&&saleEndDate&&saleEndDate<saleStartDate)throw new Error('售卖结束日期不能早于售卖开始日期');
  const benefitTemplate=normalizeMembershipBenefitTemplate(input,input?.benefitTemplate);
  return {
    ...input,
    id:opts.id||input.id||uuidv4(),
    name:String(input.name).trim(),
    tierCode:String(input.tierCode||'').trim(),
    rechargeAmount,
    discountRate,
    bonusAmount:normalizeMoney(input.bonusAmount),
    publicLessonCount:parseInt(input.publicLessonCount??benefitTemplate.publicLesson?.count)||0,
    stringingLaborCount:parseInt(input.stringingLaborCount??benefitTemplate.stringingLabor?.count)||0,
    ballMachineCount:parseInt(input.ballMachineCount??benefitTemplate.ballMachine?.count)||0,
    level2PartnerCount:parseInt(input.level2PartnerCount??benefitTemplate.level2Partner?.count)||0,
    designatedCoachPartnerCount:parseInt(input.designatedCoachPartnerCount??benefitTemplate.designatedCoachPartner?.count)||0,
    designatedCoachIds:parseArr(input.designatedCoachIds??benefitTemplate.designatedCoachPartner?.designatedCoachIds),
    customBenefits:parseArr(input.customBenefits??benefitTemplate.customBenefits),
    benefitTemplate,
    validMonths:parseInt(input.validMonths)||12,
    maxMonths:parseInt(input.maxMonths)||24,
    saleStartDate,
    saleEndDate,
    status:input.status||'draft',
    notes:input.notes||'',
    createdAt:input.createdAt||now,
    updatedAt:now
  };
}
function normalizeMembershipPlanViewRecord(plan){
  if(!plan||typeof plan!=='object')return plan;
  const benefitTemplate=normalizeMembershipBenefitTemplate(plan,plan?.benefitTemplate);
  return {
    ...plan,
    publicLessonCount:parseInt(plan.publicLessonCount??benefitTemplate.publicLesson?.count)||0,
    stringingLaborCount:parseInt(plan.stringingLaborCount??benefitTemplate.stringingLabor?.count)||0,
    ballMachineCount:parseInt(plan.ballMachineCount??benefitTemplate.ballMachine?.count)||0,
    level2PartnerCount:parseInt(plan.level2PartnerCount??benefitTemplate.level2Partner?.count)||0,
    designatedCoachPartnerCount:parseInt(plan.designatedCoachPartnerCount??benefitTemplate.designatedCoachPartner?.count)||0,
    designatedCoachIds:parseArr(plan.designatedCoachIds??benefitTemplate.designatedCoachPartner?.designatedCoachIds),
    customBenefits:parseArr(plan.customBenefits??benefitTemplate.customBenefits),
    benefitTemplate
  };
}
function normalizeMembershipOrderViewRecord(order,plan=null){
  if(!order||typeof order!=='object')return order;
  const normalizedPlan=normalizeMembershipPlanViewRecord(plan||{});
  const planBenefitTemplateSnapshot=normalizeMembershipBenefitTemplate(order?.planBenefitTemplateSnapshot?{benefitTemplate:order.planBenefitTemplateSnapshot}:order,normalizedPlan?.benefitTemplate||{});
  const hasDealSnapshot=hasMembershipBenefitSnapshot(order?.benefitSnapshot)||order?.benefitSnapshotCustomized===true;
  const benefitSnapshot=hasDealSnapshot?normalizeMembershipBenefitTemplate({benefitTemplate:order.benefitSnapshot},{}):normalizeMembershipBenefitTemplate(order,planBenefitTemplateSnapshot);
  const systemAmount=normalizeMoney(order.systemAmount??normalizedPlan.rechargeAmount);
  const finalAmount=normalizeMoney(order.finalAmount??order.rechargeAmount??systemAmount);
  const priceOverridden=order.priceOverridden!==undefined?!!order.priceOverridden:(systemAmount!==finalAmount);
  const overrideReason=String(order.overrideReason||'').trim();
  return {
    ...order,
    priceSource:order.priceSource||'membership_plan',
    priceSourceId:order.priceSourceId||order.membershipPlanId||'',
    priceSourceName:order.priceSourceName||order.membershipPlanName||normalizedPlan.name||'',
    systemAmount,
    finalAmount,
    priceOverridden,
    overrideReason,
    planBenefitTemplateSnapshot,
    benefitSnapshot
  };
}
function membershipDateRange(startDate,validMonths=12,maxMonths=24){
  return {
    cycleStartDate:startDate,
    validUntil:addMonthsKey(startDate,validMonths),
    hardExpireAt:addMonthsKey(startDate,maxMonths)
  };
}
function isMembershipAccountInTerm(account,purchaseDate){
  return account&&['active','extended'].includes(account.status)&&account.validUntil&&purchaseDate<=account.validUntil;
}
function buildMembershipPurchase({court,plan,existingAccount=null,body={},now=new Date().toISOString(),accountId=uuidv4(),orderId=uuidv4(),historyId=uuidv4()}){
  if(!court?.id)throw new Error('订场用户不存在');
  if(!plan?.id)throw new Error('会员方案不存在');
  const purchaseDate=body.purchaseDate||now.slice(0,10);
  const systemAmount=normalizeMoney(plan.rechargeAmount);
  const rechargeAmount=normalizeMoney(body.rechargeAmount??plan.rechargeAmount);
  const priceOverridden=systemAmount!==rechargeAmount;
  const overrideReason=String(body.overrideReason||'').trim();
  if(priceOverridden&&!overrideReason)throw new Error('请填写改价原因');
  if(rechargeAmount<=0)throw new Error('会员充值金额必须大于 0');
  const validMonths=parseInt(plan.validMonths)||12;
  const maxMonths=parseInt(plan.maxMonths)||24;
  const oldAccount=existingAccount||null;
  const inTerm=isMembershipAccountInTerm(oldAccount,purchaseDate);
  const lastQualified=normalizeMoney(oldAccount?.lastQualifiedRechargeAmount);
  const qualifiesRenewalReset=!oldAccount||oldAccount.status==='cleared'||(inTerm&&(!lastQualified||rechargeAmount>=lastQualified));
  const range=qualifiesRenewalReset?membershipDateRange(purchaseDate,validMonths,maxMonths):{
    cycleStartDate:oldAccount.cycleStartDate,
    validUntil:oldAccount.validUntil,
    hardExpireAt:oldAccount.hardExpireAt
  };
  const purchaseBenefitTemplate=body.benefitSnapshot||plan.benefitTemplate||{};
  const benefitSnapshotCustomized=body.benefitSnapshotCustomized===true||hasMembershipBenefitSnapshot(body.benefitSnapshot)||MEMBERSHIP_BENEFIT_FIELD_MAP.some(({field})=>body[field]!==undefined&&body[field]!==null&&String(body[field]).trim()!=='');
  const benefitSnapshot=normalizeMembershipBenefitTemplate({
    ...plan,
    ...body,
    publicLessonCount:body.publicLessonCount??purchaseBenefitTemplate.publicLesson?.count??plan.publicLessonCount,
    stringingLaborCount:body.stringingLaborCount??purchaseBenefitTemplate.stringingLabor?.count??plan.stringingLaborCount,
    ballMachineCount:body.ballMachineCount??purchaseBenefitTemplate.ballMachine?.count??plan.ballMachineCount,
    level2PartnerCount:body.level2PartnerCount??purchaseBenefitTemplate.level2Partner?.count??plan.level2PartnerCount,
    designatedCoachPartnerCount:body.designatedCoachPartnerCount??purchaseBenefitTemplate.designatedCoachPartner?.count??plan.designatedCoachPartnerCount,
    benefitTemplate:purchaseBenefitTemplate,
    customBenefits:body.customBenefits??(benefitSnapshotCustomized?[]:(purchaseBenefitTemplate.customBenefits??plan.customBenefits??plan.benefitTemplate?.customBenefits)),
    designatedCoachIds:body.designatedCoachIds??purchaseBenefitTemplate.designatedCoachPartner?.designatedCoachIds??plan.designatedCoachIds
  },plan.benefitTemplate||{});
  const account={
    ...(oldAccount||{}),
    id:oldAccount?.id||accountId,
    courtId:court.id,
    courtName:court.name||court.id,
    phone:court.phone||'',
    studentIds:normalizeStudentIds(court),
    status:'active',
    memberTag:plan.tierCode||'',
    memberLabel:plan.name||'',
    discountRate:normalizeMoney(body.discountRate??plan.discountRate),
    cycleStartDate:range.cycleStartDate,
    validUntil:range.validUntil,
    hardExpireAt:range.hardExpireAt,
    autoExtended:false,
    lastQualifiedRechargeAmount:qualifiesRenewalReset?rechargeAmount:(oldAccount?.lastQualifiedRechargeAmount||rechargeAmount),
    lastOrderId:orderId,
    notes:body.accountNotes||oldAccount?.notes||'',
    createdAt:oldAccount?.createdAt||now,
    updatedAt:now
  };
  const order={
    id:orderId,
    membershipAccountId:account.id,
    courtId:court.id,
    courtName:court.name||court.id,
    studentIds:normalizeStudentIds(court),
    membershipPlanId:plan.id,
    membershipPlanName:plan.name||'',
    priceSource:'membership_plan',
    priceSourceId:plan.id,
    priceSourceName:plan.name||'',
    systemAmount,
    finalAmount:rechargeAmount,
    priceOverridden,
    overrideReason,
    rechargeAmount,
    bonusAmount:normalizeMoney(body.bonusAmount??plan.bonusAmount),
    discountRate:account.discountRate,
    purchaseDate,
    effectiveDate:body.effectiveDate||purchaseDate,
    cycleStartDate:range.cycleStartDate,
    validUntil:range.validUntil,
    hardExpireAt:range.hardExpireAt,
    qualifiesRenewalReset,
    planBenefitTemplateSnapshot:normalizeMembershipBenefitTemplate(plan,plan.benefitTemplate||{}),
    benefitSnapshot,
    benefitSnapshotCustomized,
    benefitValidUntil:addMonthsKey(purchaseDate,validMonths),
    courtHistoryRechargeId:historyId,
    operator:body.operator||'',
    requestKey:String(body.requestKey||'').trim(),
    status:body.status||'active',
    notes:body.notes||'',
    createdAt:now,
    updatedAt:now
  };
  const historyRow={
    id:historyId,
    date:purchaseDate,
    type:'充值',
    payMethod:body.payMethod||'会员充值',
    category:'会员充值',
    amount:rechargeAmount,
    bonusAmount:order.bonusAmount,
    membershipOrderId:order.id,
    membershipAccountId:account.id,
    membershipPlanId:plan.id,
    membershipPlanName:plan.name||'',
    systemAmount,
    finalAmount:rechargeAmount,
    priceOverridden,
    overrideReason,
    discountRate:account.discountRate,
    originalAmount:0,
    discountedAmount:0,
    note:body.note||`${plan.name||'会员'}开卡/续充`
  };
  const warning=oldAccount&&inTerm&&!qualifiesRenewalReset?'低于原会员档位，已记录充值但不重置会员有效期':'';
  return {account,order,historyRow,warning};
}
function membershipBenefitItemsFromOrder(order){
  const hasDealSnapshot=hasMembershipBenefitSnapshot(order?.benefitSnapshot)||order?.benefitSnapshotCustomized===true;
  const snap=hasDealSnapshot?normalizeMembershipBenefitTemplate({benefitTemplate:order.benefitSnapshot},{}):normalizeMembershipBenefitTemplate(order,order?.planBenefitTemplateSnapshot||{});
  const items=[];
  Object.entries(snap).forEach(([code,value])=>{
    if(code==='customBenefits')return;
    const count=parseInt(value?.count)||0;
    if(count>0)items.push({membershipOrderId:order.id,membershipAccountId:order.membershipAccountId,courtId:order.courtId,benefitCode:code,benefitLabel:value.label||code,unit:value.unit||'次',total:count,benefitValidUntil:order.benefitValidUntil});
  });
  parseArr(snap.customBenefits).forEach((value,idx)=>{
    const count=parseInt(value?.count)||0;
    if(count>0)items.push({membershipOrderId:order.id,membershipAccountId:order.membershipAccountId,courtId:order.courtId,benefitCode:`custom_${idx+1}`,benefitLabel:value.label||`自定义权益${idx+1}`,unit:value.unit||'次',total:count,benefitValidUntil:order.benefitValidUntil});
  });
  return items;
}
function summarizeMembershipBenefits({orders=[],ledger=[],today=new Date().toISOString().slice(0,10)}={}){
  return (orders||[]).filter(o=>o.status!=='voided'&&o.status!=='refunded').flatMap(order=>membershipBenefitItemsFromOrder(order).map(item=>{
    const rows=(ledger||[]).filter(l=>l.membershipOrderId===item.membershipOrderId&&l.benefitCode===item.benefitCode&&l.action!=='grant');
    const positiveDelta=rows.filter(l=>(parseInt(l.delta)||0)>0).reduce((sum,l)=>sum+(parseInt(l.delta)||0),0);
    const negativeDelta=rows.filter(l=>(parseInt(l.delta)||0)<0).reduce((sum,l)=>sum+(parseInt(l.delta)||0),0);
    const total=(item.total||0)+positiveDelta;
    const expired=item.benefitValidUntil&&today>item.benefitValidUntil;
    return {...item,total,used:Math.abs(negativeDelta),adjusted:positiveDelta,remaining:expired?0:Math.max(0,total+negativeDelta),status:expired?'expired':'active'};
  }));
}
function buildMembershipGrantLedgerRows(order,opts={}){
  return membershipBenefitItemsFromOrder(order).map(item=>buildMembershipBenefitLedgerRecord({
    membershipOrderId:order.id,
    membershipAccountId:order.membershipAccountId,
    courtId:order.courtId,
    benefitCode:item.benefitCode,
    benefitLabel:item.benefitLabel,
    unit:item.unit,
    delta:item.total,
    action:'grant',
    reason:'开卡/续充赠送权益',
    operator:order.operator||'',
    relatedDate:order.purchaseDate
  },{id:opts.idFactory?opts.idFactory():uuidv4(),now:opts.now||new Date().toISOString()}));
}
function isDuplicateMembershipOrderSubmission({courtId,membershipPlanId,purchaseDate,rechargeAmount,requestKey='',recentOrders=[],now=new Date().toISOString()}={}){
  const cleanRequestKey=String(requestKey||'').trim();
  const targetAmount=normalizeMoney(rechargeAmount);
  const nowMs=dateMs(now);
  return (recentOrders||[]).some(order=>{
    if(!order||order.status==='voided'||order.status==='refunded')return false;
    if(cleanRequestKey&&String(order.requestKey||'').trim()&&String(order.requestKey||'').trim()===cleanRequestKey)return true;
    if(String(order.courtId||'')!==String(courtId||''))return false;
    if(String(order.membershipPlanId||'')!==String(membershipPlanId||''))return false;
    if(String(order.purchaseDate||'')!==String(purchaseDate||''))return false;
    if(normalizeMoney(order.rechargeAmount)!==targetAmount)return false;
    const createdMs=dateMs(order.createdAt);
    return Number.isFinite(nowMs)&&Number.isFinite(createdMs)&&Math.abs(nowMs-createdMs)<=15000;
  });
}
const RECENT_MEMBERSHIP_ORDER_TTL_MS=60000;
const recentMembershipOrderRequests=new Map();
function membershipOrderRequestDedupKey({courtId,membershipPlanId,purchaseDate,rechargeAmount,requestKey=''}={}){
  const cleanRequestKey=String(requestKey||'').trim();
  if(cleanRequestKey)return `request:${cleanRequestKey}`;
  return `payload:${String(courtId||'')}|${String(membershipPlanId||'')}|${String(purchaseDate||'')}|${normalizeMoney(rechargeAmount)}`;
}
function reserveRecentMembershipOrderRequest(input={},now=new Date().toISOString()){
  const key=membershipOrderRequestDedupKey(input);
  const nowMs=dateMs(now);
  for(const [requestKey,ts] of recentMembershipOrderRequests.entries()){
    if(!Number.isFinite(nowMs)||!Number.isFinite(ts)||Math.abs(nowMs-ts)>RECENT_MEMBERSHIP_ORDER_TTL_MS)recentMembershipOrderRequests.delete(requestKey);
  }
  const existingAt=recentMembershipOrderRequests.get(key);
  if(Number.isFinite(existingAt)&&Number.isFinite(nowMs)&&Math.abs(nowMs-existingAt)<=RECENT_MEMBERSHIP_ORDER_TTL_MS)return null;
  recentMembershipOrderRequests.set(key,Number.isFinite(nowMs)?nowMs:Date.now());
  return key;
}
function releaseRecentMembershipOrderRequest(key,{keep=false}={}){
  if(!key)return;
  if(!keep)recentMembershipOrderRequests.delete(key);
}
function buildMembershipBenefitLedgerRecord(input,opts={}){
  if(!input?.membershipOrderId)throw new Error('会员权益流水必须关联购买批次');
  if(!input?.membershipAccountId)throw new Error('会员权益流水必须关联会员账户');
  if(!input?.courtId)throw new Error('会员权益流水必须关联订场用户');
  if(!input?.benefitCode)throw new Error('请选择会员权益');
  const delta=parseInt(input.delta)||0;
  if(!delta)throw new Error('权益变动次数不能为 0');
  return {
    ...input,
    id:opts.id||input.id||uuidv4(),
    delta,
    benefitLabel:input.benefitLabel||input.benefitCode,
    unit:input.unit||'次',
    action:input.action||(delta<0?'consume':'supplement'),
    reason:input.reason||(delta<0?'会员权益使用':'会员权益补发'),
    operator:input.operator||'',
    notes:input.notes||'',
    relatedDate:input.relatedDate||opts.now?.slice(0,10)||new Date().toISOString().slice(0,10),
    createdAt:input.createdAt||opts.now||new Date().toISOString()
  };
}
function buildMembershipAccountEventRecord(input,opts={}){
  if(!input?.membershipAccountId)throw new Error('会员账户事件必须关联会员账户');
  if(!input?.courtId)throw new Error('会员账户事件必须关联订场用户');
  if(!input?.eventType)throw new Error('会员账户事件必须包含事件类型');
  return {
    ...input,
    id:opts.id||input.id||uuidv4(),
    operator:input.operator||'',
    reason:input.reason||'',
    createdAt:input.createdAt||opts.now||new Date().toISOString()
  };
}
function allocateMembershipBenefitUsage({membershipAccountId,courtId,benefitCode,benefitLabel='',unit='次',consumeCount,orders=[],ledger=[],today,now=new Date().toISOString(),idFactory=uuidv4,operator='',reason='会员权益使用',relatedDate=''}={}){
  const need=Math.abs(parseInt(consumeCount)||0);
  if(!membershipAccountId)throw new Error('会员权益流水必须关联会员账户');
  if(!courtId)throw new Error('会员权益流水必须关联订场用户');
  if(!benefitCode)throw new Error('请选择会员权益');
  if(need<=0)throw new Error('权益变动次数不能为 0');
  const currentDay=today||String(relatedDate||now).slice(0,10);
  const batches=summarizeMembershipBenefits({orders,ledger,today:currentDay})
    .filter(item=>item.membershipAccountId===membershipAccountId&&item.courtId===courtId&&item.benefitCode===benefitCode&&item.remaining>0&&item.status!=='expired')
    .sort((a,b)=>{
      const av=String(a.benefitValidUntil||'9999-99-99');
      const bv=String(b.benefitValidUntil||'9999-99-99');
      if(av!==bv)return av.localeCompare(bv);
      return String(a.membershipOrderId||'').localeCompare(String(b.membershipOrderId||''));
    });
  const available=batches.reduce((sum,item)=>sum+(parseInt(item.remaining)||0),0);
  if(available<need)throw new Error('剩余权益不足');
  let remaining=need;
  const rows=[];
  for(const batch of batches){
    if(remaining<=0)break;
    const delta=Math.min(remaining,parseInt(batch.remaining)||0);
    if(delta<=0)continue;
    rows.push(buildMembershipBenefitLedgerRecord({
      membershipOrderId:batch.membershipOrderId,
      membershipAccountId,
      courtId,
      benefitCode,
      benefitLabel:benefitLabel||batch.benefitLabel||benefitCode,
      unit:unit||batch.unit||'次',
      delta:-delta,
      action:'consume',
      reason,
      operator,
      relatedDate:relatedDate||currentDay
    },{id:idFactory(),now}));
    remaining-=delta;
  }
  return rows;
}
function reconcileMembershipAccounts({accounts=[],courts=[],today=new Date().toISOString().slice(0,10),now=new Date().toISOString(),eventIdFactory=uuidv4,historyIdFactory=uuidv4}={}){
  const courtMap=new Map((courts||[]).map(c=>[c.id,c]));
  const nextAccounts=[],events=[],historyRows=[];
  for(const account of accounts||[]){
    let next={...account};
    const court=courtMap.get(account.courtId);
    const finance=computeCourtFinance(court||{history:[]});
    const balance=normalizeMoney(finance.balance);
    if(account.hardExpireAt&&today>account.hardExpireAt&&balance>0&&account.status!=='cleared'){
      const event={id:eventIdFactory(),membershipAccountId:account.id,courtId:account.courtId,eventType:'auto_clear',beforeStatus:account.status,afterStatus:'cleared',beforeValidUntil:account.validUntil,afterValidUntil:account.validUntil,operator:'system',reason:'两年到期余额清零',createdAt:now};
      const historyRow={id:historyIdFactory(),date:today,type:'冲正',payMethod:'储值扣款',category:'会员到期清零',amount:balance,membershipAccountId:account.id,note:'两年到期余额清零'};
      next={...next,status:'cleared',updatedAt:now};
      events.push(event);
      historyRows.push(historyRow);
    }else if(account.validUntil&&account.hardExpireAt&&today>account.validUntil&&today<=account.hardExpireAt&&balance>0&&!account.autoExtended&&account.status==='active'){
      const event={id:eventIdFactory(),membershipAccountId:account.id,courtId:account.courtId,eventType:'auto_extend',beforeStatus:account.status,afterStatus:'extended',beforeValidUntil:account.validUntil,afterValidUntil:account.hardExpireAt,operator:'system',reason:'一年期到期仍有余额，自动延续 12 个月',createdAt:now};
      next={...next,status:'extended',autoExtended:true,updatedAt:now};
      events.push(event);
    }
    nextAccounts.push(next);
  }
  return {accounts:nextAccounts,events,historyRows};
}
function legacyCourtFinanceWarnings(court){
  const total=normalizeMoney(court?.totalDeposit);
  const balance=normalizeMoney(court?.balance);
  const spent=normalizeMoney(court?.spentAmount);
  const warnings=[];
  if(balance>total)warnings.push('余额大于累计充值');
  if(total-balance>spent)warnings.push('余额减少金额大于累计消费');
  return warnings;
}
function shouldMigrateLegacyCourtFinance(court){
  return !normalizeCourtHistory(court?.history).length&&(
    normalizeMoney(court?.balance)>0||
    normalizeMoney(court?.totalDeposit)>0||
    normalizeMoney(court?.spentAmount)>0
  );
}
async function loadCourtDeleteReferenceData(){
  const [membershipAccounts,membershipOrders,membershipBenefitLedger,membershipAccountEvents]=await Promise.all([
    getCachedScan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]),
    getCachedScan(T_MEMBERSHIP_ORDERS).catch(()=>[]),
    getCachedScan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[]),
    getCachedScan(T_MEMBERSHIP_ACCOUNT_EVENTS).catch(()=>[])
  ]);
  return {membershipAccounts,membershipOrders,membershipBenefitLedger,membershipAccountEvents};
}
async function deleteCourtsByIds(ids,data={}){
  const uniqueIds=[...new Set((ids||[]).map(id=>String(id||'').trim()).filter(Boolean))];
  const courts=await getCachedScan(T_COURTS).catch(()=>[]);
  const courtMap=new Map((courts||[]).map(c=>[String(c.id||''),c]));
  const deleted=[],archived=[],errors=[];
  for(let i=0;i<uniqueIds.length;i+=25){
    const chunk=uniqueIds.slice(i,i+25);
    const results=await Promise.all(chunk.map(async(id)=>{
      try{
        const court=courtMap.get(id)||null;
        if(!court)return {id,ok:false,error:'订场用户不存在'};
        const action=courtDeleteAction(court,data);
        if(action==='delete'){
          await del(T_COURTS,id);
          return {id,ok:true,action};
        }
        const now=new Date().toISOString();
        await put(T_COURTS,id,{...court,status:'inactive',deletedAt:court.deletedAt||now,updatedAt:now});
        return {id,ok:true,action};
      }catch(e){
        return {id,ok:false,error:e.message};
      }
    }));
    results.forEach(r=>{
      if(!r.ok){errors.push({id:r.id,error:r.error});return;}
      if(r.action==='archive')archived.push(r.id);
      else deleted.push(r.id);
    });
  }
  return {success:deleted.length,archivedCount:archived.length,failed:errors.length,deleted,archived,errors};
}
async function clearAllCourts(){
  const existing=await getCachedScan(T_COURTS);
  for(let i=0;i<existing.length;i+=20)await Promise.all(existing.slice(i,i+20).map(r=>del(T_COURTS,r.id)));
  return existing.length;
}
async function importCourtRows(rows){
  const schedules=await getCachedScan(T_SCHEDULE).catch(()=>[]);
  let success=0,failed=0;
  const errors=[];
  for(const row of rows){
    try{
      const id=uuidv4();
      const record={...normalizeCourtRecord(row,{schedules}),id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      await put(T_COURTS,id,record);
      success++;
    }catch(e){
      failed++;
      errors.push({name:row?.name||'',error:e.message});
    }
  }
  return {success,failed,errors};
}
async function runMembershipReconcile(rows){
  const accounts=Array.isArray(rows?.accounts)?rows.accounts:await getCachedScan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]);
  const courts=Array.isArray(rows?.courts)?rows.courts:await getCachedScan(T_COURTS).catch(()=>[]);
  const result=reconcileMembershipAccounts({accounts,courts});
  const accountMap=new Map((accounts||[]).map(a=>[a.id,a]));
  const changedAccounts=result.accounts.filter(a=>JSON.stringify(a)!==JSON.stringify(accountMap.get(a.id)));
  for(const account of changedAccounts)await put(T_MEMBERSHIP_ACCOUNTS,account.id,account);
  const courtMap=new Map((courts||[]).map(c=>[c.id,c]));
  for(const row of result.historyRows){
    const court=courtMap.get(row.courtId);
    if(!court)continue;
    const history=[...normalizeCourtHistory(court.history),row];
    const next=normalizeCourtRecord({...court,history,updatedAt:new Date().toISOString()});
    await put(T_COURTS,court.id,next);
    courtMap.set(court.id,next);
  }
  for(const event of result.events)await put(T_MEMBERSHIP_ACCOUNT_EVENTS,event.id,event);
  return {...result,accounts:result.accounts,courts:[...courtMap.values()]};
}
function parseLegacyCourtNotes(notes){
  const raw=String(notes||'').trim();
  if(!raw)return{notes:'',updates:{},changed:false};
  const parts=raw.split(/[；;]\s*/).map(x=>String(x||'').trim()).filter(Boolean);
  const remain=[];
  const updates={};
  for(const part of parts){
    const m=part.match(/^([^：:]+)[：:]\s*(.+)$/);
    if(!m){remain.push(part);continue;}
    const key=String(m[1]||'').trim();
    const value=String(m[2]||'').trim();
    if(!value)continue;
    if(key==='序号')continue;
    if((key==='负责人'||key==='对接人')&&!updates.owner)updates.owner=value;
    else if((key==='对储值的态度'||key==='对储值态度')&&!updates.depositAttitude)updates.depositAttitude=value;
    else if(key==='熟悉程度'&&!updates.familiarity)updates.familiarity=value;
    else if((key==='消费金额'||key==='消费金额（仅自己订场部分）')&&updates.spentAmount==null){
      const amt=parseFloat(String(value).replace(/[^\d.-]/g,''));
      if(!Number.isNaN(amt))updates.spentAmount=amt;
    }else remain.push(part);
  }
  const nextNotes=remain.join('；');
  const changed=nextNotes!==raw||Object.keys(updates).length>0;
  return {notes:nextNotes,updates,changed};
}

module.exports = async (req, res) => {
  scheduleInitInBackground();
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');return res.status(200).end();}
  const path=(req.url||'').replace(/^\/api/,'').split('?')[0];
  const query=new URL(req.url||'/', 'http://local').searchParams;
  const method=req.method;
  const startedAt=Date.now();
  if(res&&typeof res.on==='function')res.on('finish',()=>{console.log(`[api] ${method} ${path} ${res.statusCode} ${Date.now()-startedAt}ms`);});
  const body=req.body||{};
  try{
    if(path==='/health')return sendJson(res,{status:'ok',time:new Date().toISOString()});
    if(path==='/cron/course-reminders'&&method==='GET'){
      const ua=String(req.headers['user-agent']||'');
      if(process.env.CRON_SECRET){
        const auth=String(req.headers.authorization||'');
        if(auth!==`Bearer ${process.env.CRON_SECRET}`)return sendJson(res,{error:'无权限'},403);
      }else if(!/vercel-cron/i.test(ua)){
        return sendJson(res,{error:'无权限'},403);
      }
      await init();
      return sendJson(res,await sendCourseReminders());
    }
    if(path==='/auth/login'&&method==='POST'){const{username,password}=body;if(!username||!password)return sendJson(res,{error:'请填写账号和密码'},400);const user=await getCachedRow(T_USERS,username);if(!user||!await bcrypt.compare(password,user.password))return sendJson(res,{error:'账号或密码错误'},401);const payload=mergeStoredAuthUser(null,user);try{assertAuthUserActive(payload);}catch(e){return sendJson(res,{error:e.message},403);}const token=jwt.sign(payload,JWT_SECRET,{expiresIn:'7d'});return sendJson(res,{token,user:payload});}
    if(path==='/auth/wechat-login'&&method==='POST'){
      const code=String(body.code||'').trim();
      if(!code)return sendJson(res,{error:'缺少微信登录凭证'},400);
      const session=await fetchWechatSession(code);
      const openid=extractWechatOpenId(session);
      const account=findWechatUserByOpenId(await getCachedScan(T_USERS).catch(()=>[]),openid);
      if(!account)return sendJson(res,{error:'微信未绑定教练账号，请先使用账号密码登录完成绑定'},404);
      const payload=mergeStoredAuthUser(null,account);
      try{assertAuthUserActive(payload);}catch(e){return sendJson(res,{error:e.message},403);}
      const token=jwt.sign(payload,JWT_SECRET,{expiresIn:'7d'});
      return sendJson(res,{token,user:payload});
    }
    if(path==='/auth/wechat-mini-login'&&method==='POST'){
      const code=String(body.code||'').trim();
      if(!code)return sendJson(res,{error:'缺少微信登录凭证'},400);
      const session=await fetchWechatSession(code,'match');
      const openid=extractWechatOpenId(session);
      const unionid=session.unionid?String(session.unionid):'';
      const pool=getMatchSqlPool();
      const existing=await pool.query('SELECT * FROM match_users WHERE openid=$1 LIMIT 1',[openid]);
      let matchUser=existing.rows[0];
      if(!matchUser){
        const now=new Date().toISOString();
        matchUser={id:uuidv4(),openid,unionid,nickName:'',avatarUrl:'',phone:'',ntrpLevel:'',createdAt:now,updatedAt:now};
        await pool.query(
          'INSERT INTO match_users(id,openid,unionid,nickName,avatarUrl,phone,ntrpLevel,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())',
          [matchUser.id,matchUser.openid,matchUser.unionid,matchUser.nickName,matchUser.avatarUrl,matchUser.phone,matchUser.ntrpLevel]
        );
      }
      return sendJson(res,{token:buildMatchUserToken(matchUser),user:{id:matchUser.id,type:'match_user',openid:matchUser.openid,phone:matchUser.phone||'',ntrpLevel:matchUser.ntrplevel||matchUser.ntrpLevel||'',canCreateMatch:await canMatchUserCreate(matchUser.id)}});
    }
    if(path==='/matches'&&method==='GET'){
      const matchUser=requireMatchUser(req);
      return sendJson(res,{items:await listMatchesForViewer(matchUser.id)});
    }
    if(path==='/matches'&&method==='POST'){
      const matchUser=requireMatchUser(req);
      const profile=await getMatchSqlPool().query('SELECT phone FROM match_users WHERE id=$1',[matchUser.id]);
      if(!profile.rows[0]?.phone)return sendJson(res,{error:'请先授权手机号'},409);
      return sendJson(res,await createMatchForUser(matchUser.id,body));
    }
    const matchDetailM=path.match(/^\/matches\/([^/]+)$/);
    if(matchDetailM&&method==='GET'){
      const matchUser=requireMatchUser(req);
      const match=await getMatchForViewer(matchDetailM[1],matchUser.id);
      if(!match)return sendJson(res,{error:'球局不存在'},404);
      return sendJson(res,toMatchDetailResponse(match));
    }
    const matchUpdateM=path.match(/^\/matches\/([^/]+)$/);
    if(matchUpdateM&&method==='PUT'){
      const matchUser=requireMatchUser(req);
      try{
        await updateMatchForUser(matchUpdateM[1],matchUser.id,body);
        const match=await getMatchForViewer(matchUpdateM[1],matchUser.id);
        return sendJson(res,toMatchDetailResponse(match));
      }catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    const matchCancelM=path.match(/^\/matches\/([^/]+)\/cancel$/);
    if(matchCancelM&&method==='POST'){
      const matchUser=requireMatchUser(req);
      try{return sendJson(res,await cancelMatchForUser(matchCancelM[1],matchUser.id,body.reason));}
      catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    const matchRegisterM=path.match(/^\/matches\/([^/]+)\/register$/);
    if(matchRegisterM&&method==='POST'){
      const matchUser=requireMatchUser(req);
      const profile=await getMatchSqlPool().query('SELECT phone FROM match_users WHERE id=$1',[matchUser.id]);
      if(!profile.rows[0]?.phone)return sendJson(res,{error:'请先授权手机号'},409);
      try{return sendJson(res,await registerMatchUser(matchRegisterM[1],matchUser.id));}
      catch(err){
        const message=String(err?.message||err);
        return sendJson(res,{error:message},/名额已满|已报名/.test(message)?409:400);
      }
    }
    const matchCancelRegisterM=path.match(/^\/matches\/([^/]+)\/cancel-registration$/);
    if(matchCancelRegisterM&&method==='POST'){
      const matchUser=requireMatchUser(req);
      try{return sendJson(res,await cancelRegistrationForUser(matchCancelRegisterM[1],matchUser.id));}
      catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    if(path==='/my-matches'&&method==='GET'){
      const matchUser=requireMatchUser(req);
      return sendJson(res,{items:await listMyMatches(matchUser.id)});
    }
    if(path==='/match-profile'&&method==='GET'){
      const matchUser=requireMatchUser(req);
      return sendJson(res,await getMatchProfile(matchUser.id));
    }
    if(path==='/match-profile'&&method==='POST'){
      const matchUser=requireMatchUser(req);
      return sendJson(res,await updateMatchProfile(matchUser.id,body));
    }
    if(path==='/match-profile/phone'&&method==='POST'){
      const matchUser=requireMatchUser(req);
      return sendJson(res,await updateMatchProfile(matchUser.id,{phone:body.phone}));
    }
    if(path==='/match-profile/phone-code'&&method==='POST'){
      const matchUser=requireMatchUser(req);
      try{
        const phone=await fetchWechatPhoneNumber(String(body.code||'').trim(),'match');
        return sendJson(res,await updateMatchProfile(matchUser.id,{phone}));
      }catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    if(path==='/match-attendance'&&method==='POST'){
      const matchUser=requireMatchUser(req);
      try{return sendJson(res,await selfConfirmMatchAttendance(body.matchId,matchUser.id));}
      catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    if(path==='/match-attendance/creator-confirm'&&method==='POST'){
      const matchUser=requireMatchUser(req);
      try{return sendJson(res,await creatorConfirmMatchAttendance(body.matchId,matchUser.id,body.registrationId,body.finalAttendanceStatus));}
      catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    if(path==='/match-notifications'&&method==='GET'){
      const matchUser=requireMatchUser(req);
      return sendJson(res,{items:await listMatchNotifications(matchUser.id)});
    }
    if(path==='/match-players'&&method==='GET'){
      requireMatchUser(req);
      return sendJson(res,{items:await listMatchPlayers()});
    }
    let user=authUser(req);if(!user)return sendJson(res,{error:'未登录'},401);
    if(user.type==='match_user')return sendJson(res,{error:'无管理端权限'},403);
    const storedAuthUser=await getCachedRow(T_USERS,user.id).catch(()=>null);
    user=mergeStoredAuthUser(user,storedAuthUser);
    try{assertAuthUserActive(user);}catch(e){return sendJson(res,{error:e.message},403);}
    if(path==='/admin/matches'&&method==='GET'){
      requireAdminUser(user);
      return sendJson(res,{items:await listAdminMatches()});
    }
    if(path==='/admin/matches/finance-daily'&&method==='GET'){
      requireMatchAdminPermission(user,'match_finance');
      return sendJson(res,await getMatchFinanceDailyReportForAdmin(query.get('date')||new Date().toISOString().slice(0,10)));
    }
    const adminBookingM=path.match(/^\/admin\/matches\/([^/]+)\/booking$/);
    if(adminBookingM&&method==='POST'){
      requireMatchAdminPermission(user,'match_ops');
      try{return sendJson(res,await adminBookMatch(adminBookingM[1],user.id,body));}
      catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    const adminAttendanceM=path.match(/^\/admin\/matches\/([^/]+)\/attendance$/);
    if(adminAttendanceM&&method==='POST'){
      requireMatchAdminPermission(user,'match_ops');
      try{return sendJson(res,await confirmMatchAttendance(adminAttendanceM[1],user.id,body.items||body.participants||[]));}
      catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    const adminWithdrawalM=path.match(/^\/admin\/matches\/([^/]+)\/registrations\/([^/]+)\/withdrawal$/);
    if(adminWithdrawalM&&method==='POST'){
      requireMatchAdminPermission(user,'match_ops');
      try{return sendJson(res,await adminHandleBookedWithdrawal(adminWithdrawalM[1],adminWithdrawalM[2],user.id,body));}
      catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    const adminReplacementM=path.match(/^\/admin\/matches\/([^/]+)\/replacements\/transfer$/);
    if(adminReplacementM&&method==='POST'){
      requireMatchAdminPermission(user,'match_ops');
      requireMatchAdminPermission(user,'match_finance');
      try{return sendJson(res,await adminTransferMatchReplacement(adminReplacementM[1],user.id,body));}
      catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    const adminFeeConfirmM=path.match(/^\/admin\/matches\/([^/]+)\/fees\/confirm$/);
    if(adminFeeConfirmM&&method==='POST'){
      requireMatchAdminPermission(user,'match_finance');
      try{return sendJson(res,await generateMatchFeeLedger(adminFeeConfirmM[1],user.id,body));}
      catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    const adminFeeSplitM=path.match(/^\/admin\/matches\/([^/]+)\/fees\/splits\/([^/]+)$/);
    if(adminFeeSplitM&&method==='POST'){
      requireMatchAdminPermission(user,'match_finance');
      try{return sendJson(res,await markMatchFeeSplit(adminFeeSplitM[1],adminFeeSplitM[2],user.id,body));}
      catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    if(path==='/admin/create-user'&&method==='POST'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);await init();const{id,name,password,role,coachId,coachName}=body;if(!id||!name||!password)return sendJson(res,{error:'缺少必填字段'},400);const nextRole=role||'editor';const hashed=await bcrypt.hash(password,10);const nextCoachName=coachName||(nextRole==='editor'?name:'');const matchPermissions=userMatchPermissions({matchPermissions:body.matchPermissions||body.permissions||[]});await put(T_USERS,id,{id,name,password:hashed,role:nextRole,status:'active',coachId:coachId||'',coachName:nextCoachName,matchPermissions});return sendJson(res,{success:true,id,name,role:nextRole,status:'active',coachId:coachId||'',coachName:nextCoachName,matchPermissions});}
    if(path==='/admin/update-user'&&method==='POST'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);await init();const{id,coachId,coachName,status}=body;if(!id)return sendJson(res,{error:'缺少用户ID'},400);const u=await get(T_USERS,id);if(!u)return sendJson(res,{error:'用户不存在'},404);let updates={...u,coachId:coachId||'',status:status||u.status||'active'};if(body.name)updates.name=body.name;updates.coachName=coachName||(u.role==='editor'?(updates.name||u.name):'');if(Array.isArray(body.matchPermissions)||Array.isArray(body.permissions))updates.matchPermissions=userMatchPermissions({matchPermissions:body.matchPermissions||body.permissions});if(body.clearWechat)updates=buildWechatUnboundUser(updates);await put(T_USERS,id,updates);return sendJson(res,{success:true});}
    if(path==='/admin/users'&&method==='GET'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);await init();const all=await getCachedScan(T_USERS);return sendJson(res,all.map(buildAdminUserView));}
    if(path==='/admin/clear-test-data'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      if(body.confirm!=='CLEAR_TEST_DATA')return sendJson(res,{error:'缺少清空确认'},400);
      await init();
      const result=await clearTables({scan,del},TEST_DATA_RESET_TABLES);
      return sendJson(res,{...result,kept:[T_USERS,T_COACHES,T_CAMPUSES]});
    }
    if(path==='/admin/replace-courts'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const cleared=await clearAllCourts();
      const rows=Array.isArray(body.rows)?body.rows:[];
      const result=await importCourtRows(rows);
      return sendJson(res,{cleared,...result});
    }
    if(path==='/admin/clear-courts'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const cleared=await clearAllCourts();
      return sendJson(res,{cleared});
    }
    if(path==='/admin/import-courts'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const rows=Array.isArray(body.rows)?body.rows:[];
      return sendJson(res,await importCourtRows(rows));
    }
    if(path==='/auth/wechat-bind'&&method==='POST'){
      const code=String(body.code||'').trim();
      if(!code)return sendJson(res,{error:'缺少微信登录凭证'},400);
      const session=await fetchWechatSession(code);
      const openid=extractWechatOpenId(session);
      const stored=await get(T_USERS,user.id);
      if(!stored)return sendJson(res,{error:'用户不存在'},404);
      await put(T_USERS,user.id,buildWechatBoundUser(stored,openid));
      return sendJson(res,{success:true,wechatBound:true});
    }
    if(path==='/auth/me')return sendJson(res,user);
    if(path==='/load-all'&&method==='GET'){
      await init();
      await maybeRepairImportedLedgerDuplicates();
      const [rawCourts,students,products,packages,purchases,entitlements,entitlementLedger,financialLedger,membershipPlans,membershipAccounts,membershipOrders,membershipBenefitLedger,membershipAccountEvents,pricePlans,plans,schedule,coaches,classes,campuses,feedbacks]=await Promise.all([
        timed('load-all scan courts',()=>scan(T_COURTS)),
        timed('load-all scan students',()=>scan(T_STUDENTS)),
        timed('load-all scan products',()=>scan(T_PRODUCTS)),
        timed('load-all scan packages',()=>scan(T_PACKAGES).catch(()=>[])),
        timed('load-all scan purchases',()=>scan(T_PURCHASES).catch(()=>[])),
        timed('load-all scan entitlements',()=>scan(T_ENTITLEMENTS).catch(()=>[])),
        timed('load-all scan entitlement ledger',()=>scan(T_ENTITLEMENT_LEDGER).catch(()=>[])),
        timed('load-all scan financial ledger',()=>scan(T_FINANCIAL_LEDGER).catch(()=>[])),
        timed('load-all scan membership plans',()=>scan(T_MEMBERSHIP_PLANS).catch(()=>[])),
        timed('load-all scan membership accounts',()=>scan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[])),
        timed('load-all scan membership orders',()=>scan(T_MEMBERSHIP_ORDERS).catch(()=>[])),
        timed('load-all scan membership benefit ledger',()=>scan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[])),
        timed('load-all scan membership account events',()=>scan(T_MEMBERSHIP_ACCOUNT_EVENTS).catch(()=>[])),
        timed('load-all scan price plans',()=>scan(T_PRICE_PLANS).catch(()=>[])),
        timed('load-all scan plans',()=>scan(T_PLANS)),
        timed('load-all scan schedule',()=>scan(T_SCHEDULE)),
        timed('load-all scan coaches',()=>scan(T_COACHES).catch(()=>[])),
        timed('load-all scan classes',()=>scan(T_CLASSES).catch(()=>[])),
        timed('load-all scan campuses',()=>listCampusesWithDefaults()),
        timed('load-all scan feedbacks',()=>withTimeout(scanFeedbacks().catch(()=>[]),3000,[]))
      ]);
      const normalizedMembershipPlans=(Array.isArray(membershipPlans)?membershipPlans:[]).map(normalizeMembershipPlanViewRecord);
      const membershipPlanMap=new Map(normalizedMembershipPlans.map(p=>[p.id,p]));
      const normalizedMembershipOrders=(Array.isArray(membershipOrders)?membershipOrders:[]).map(order=>normalizeMembershipOrderViewRecord(order,membershipPlanMap.get(order.membershipPlanId)));
      const reconciled=await runMembershipReconcile({accounts:membershipAccounts,courts:rawCourts});
      const courts=reconciled.courts||rawCourts;
      const loaded=filterLoadAllForUser({
        courts:Array.isArray(courts)?courts:[],
        students:Array.isArray(students)?students:[],
        products:Array.isArray(products)?products:[],
        packages:Array.isArray(packages)?packages:[],
        purchases:Array.isArray(purchases)?purchases:[],
        entitlements:Array.isArray(entitlements)?entitlements:[],
        entitlementLedger:normalizeEntitlementLedgerRowsForView(Array.isArray(entitlementLedger)?entitlementLedger:[]),
        financialLedger:Array.isArray(financialLedger)?financialLedger:[],
        membershipPlans:normalizedMembershipPlans,
        membershipAccounts:Array.isArray(reconciled.accounts)?reconciled.accounts:[],
        membershipOrders:normalizedMembershipOrders,
        membershipBenefitLedger:Array.isArray(membershipBenefitLedger)?membershipBenefitLedger:[],
        membershipAccountEvents:[...(Array.isArray(membershipAccountEvents)?membershipAccountEvents:[]),...(reconciled.events||[])],
        pricePlans:Array.isArray(pricePlans)?pricePlans:[],
        plans:Array.isArray(plans)?plans:[],
        schedule:Array.isArray(schedule)?schedule:[],
        coaches:Array.isArray(coaches)?coaches:[],
        classes:Array.isArray(classes)?classes:[],
        campuses:Array.isArray(campuses)?campuses:[],
        feedbacks:Array.isArray(feedbacks)?feedbacks:[]
      },user);
      return sendJson(res,{...loaded,user});
    }
    if(path==='/auth/change-password'&&method==='POST'){const u=await get(T_USERS,user.id);if(!await bcrypt.compare(body.oldPassword,u.password))return sendJson(res,{error:'原密码错误'},400);await put(T_USERS,user.id,{...u,password:await bcrypt.hash(body.newPassword,10)});return sendJson(res,{success:true});}
    if(path==='/price-plans'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      if(method==='GET')return sendJson(res,await getCachedScan(T_PRICE_PLANS).catch(()=>[]));
      if(method==='POST'){
        const id=uuidv4();
        const now=new Date().toISOString();
        const r=normalizePricePlan({...body,id},id,now);
        await put(T_PRICE_PLANS,id,r);
        return sendJson(res,r);
      }
    }
    if(path==='/price-plans/quote'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      return sendJson(res,quoteVenuePrice(await getCachedScan(T_PRICE_PLANS).catch(()=>[]),body));
    }
    const pricePlanM=path.match(/^\/price-plans\/(.+)$/);
    if(pricePlanM){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const id=pricePlanM[1];
      if(method==='GET')return sendJson(res,await getCachedRow(T_PRICE_PLANS,id));
      const old=await getCachedRow(T_PRICE_PLANS,id).catch(()=>null);
      if(!old)return sendJson(res,{error:'价格方案不存在'},404);
      if(method==='PUT'){
        const r=normalizePricePlan({...old,...body,id},id,new Date().toISOString(),old);
        await put(T_PRICE_PLANS,id,r);
        return sendJson(res,r);
      }
      if(method==='DELETE'){
        const r={...old,status:'inactive',updatedAt:new Date().toISOString()};
        await put(T_PRICE_PLANS,id,r);
        return sendJson(res,{success:true,archived:true,pricePlan:r});
      }
    }
    if(path==='/courts'){
      await init();
      if(method==='GET')return sendJson(res,await getCachedScan(T_COURTS));
      if(method==='POST'){
        const id=uuidv4();
        const schedules=await getCachedScan(T_SCHEDULE).catch(()=>[]);
        const r={...normalizeCourtRecord(body,{schedules}),id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
        await put(T_COURTS,id,r);return sendJson(res,r);
      }
    }
    if(path==='/courts/import'&&method==='POST'){
      await init();
      const rows=Array.isArray(body.rows)?body.rows:[];
      return sendJson(res,await importCourtRows(rows));
    }
    if(path==='/courts/batch-delete'&&method==='POST'){
      await init();
      const result=await deleteCourtsByIds(body.ids,await loadCourtDeleteReferenceData());
      return sendJson(res,result);
    }
    if(path==='/courts/merge'&&method==='POST'){
      await init();
      const sourceCourtId=String(body?.sourceCourtId||'').trim();
      const targetCourtId=String(body?.targetCourtId||'').trim();
      const deleteSource=body?.deleteSource===true;
      if(!sourceCourtId||!targetCourtId)return sendJson(res,{error:'请选择要合并的订场用户'},400);
      if(sourceCourtId===targetCourtId)return sendJson(res,{error:'不能合并到自己'},400);
      const [sourceCourt,targetCourt,membershipRefs]=await Promise.all([
        getCachedRow(T_COURTS,sourceCourtId).catch(()=>null),
        getCachedRow(T_COURTS,targetCourtId).catch(()=>null),
        loadCourtDeleteReferenceData()
      ]);
      if(!sourceCourt)return sendJson(res,{error:'原订场用户不存在'},404);
      if(!targetCourt)return sendJson(res,{error:'目标订场用户不存在'},404);
      const merged=mergeCourtRecords({
        targetCourt,
        sourceCourt,
        membershipAccounts:membershipRefs.membershipAccounts,
        membershipOrders:membershipRefs.membershipOrders,
        membershipBenefitLedger:membershipRefs.membershipBenefitLedger,
        membershipAccountEvents:membershipRefs.membershipAccountEvents,
        now:new Date().toISOString()
      });
      await put(T_COURTS,targetCourt.id,merged.targetCourt);
      await Promise.all([
        ...merged.membershipAccounts.filter(row=>String(row.courtId||'')===targetCourtId).map(row=>put(T_MEMBERSHIP_ACCOUNTS,row.id,row)),
        ...merged.membershipOrders.filter(row=>String(row.courtId||'')===targetCourtId).map(row=>put(T_MEMBERSHIP_ORDERS,row.id,row)),
        ...merged.membershipBenefitLedger.filter(row=>String(row.courtId||'')===targetCourtId).map(row=>put(T_MEMBERSHIP_BENEFIT_LEDGER,row.id,row)),
        ...merged.membershipAccountEvents.filter(row=>String(row.courtId||'')===targetCourtId).map(row=>put(T_MEMBERSHIP_ACCOUNT_EVENTS,row.id,row))
      ]);
      if(deleteSource)await del(T_COURTS,sourceCourt.id);
      else await put(T_COURTS,sourceCourt.id,merged.sourceCourt);
      return sendJson(res,{success:true,targetCourt:merged.targetCourt,removedCourtId:deleteSource?sourceCourt.id:'',archivedSource:!deleteSource});
    }
    if(path==='/courts/migrate-legacy'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const dryRun=body?.dryRun!==false;
      const rows=await getCachedScan(T_COURTS);
      let changed=0;
      const preview=[];
      for(const row of rows){
        const parsed=parseLegacyCourtNotes(row.notes);
        const next={
          ...row,
          notes:parsed.notes,
          owner:row.owner||parsed.updates.owner||'',
          depositAttitude:row.depositAttitude||parsed.updates.depositAttitude||'',
          familiarity:row.familiarity||parsed.updates.familiarity||'',
          spentAmount:row.spentAmount!=null&&row.spentAmount!==''?parseFloat(row.spentAmount)||0:(parsed.updates.spentAmount||0)
        };
        const hasFieldChange=
          String(next.notes||'')!==String(row.notes||'')||
          String(next.owner||'')!==String(row.owner||'')||
          String(next.depositAttitude||'')!==String(row.depositAttitude||'')||
          String(next.familiarity||'')!==String(row.familiarity||'')||
          String(next.spentAmount||0)!==String(row.spentAmount||0);
        if(!hasFieldChange)continue;
        changed++;
        if(preview.length<20)preview.push({id:row.id,name:row.name,before:row.notes||'',after:next.notes||'',owner:next.owner||'',depositAttitude:next.depositAttitude||'',familiarity:next.familiarity||'',spentAmount:next.spentAmount||0});
        if(!dryRun)await put(T_COURTS,row.id,{...next,updatedAt:new Date().toISOString()});
      }
      return sendJson(res,{dryRun,total:rows.length,changed,preview});
    }
    if(path==='/courts/migrate-finance-legacy'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const dryRun=body?.dryRun!==false;
      const rows=await getCachedScan(T_COURTS);
      const schedules=await getCachedScan(T_SCHEDULE).catch(()=>[]);
      let candidates=0,migrated=0,skipped=0;
      const preview=[];
      for(const row of rows){
        if(!shouldMigrateLegacyCourtFinance(row))continue;
        candidates++;
        const history=buildLegacyCourtOpeningHistory(row);
        const warnings=legacyCourtFinanceWarnings(row);
        let computed=null;
        try{computed=computeCourtFinance({...row,history});}catch(e){warnings.push(e.message);}
        if(preview.length<20)preview.push({
          id:row.id,
          name:row.name||'',
          before:{balance:normalizeMoney(row.balance),totalDeposit:normalizeMoney(row.totalDeposit),spentAmount:normalizeMoney(row.spentAmount),receivedAmount:normalizeMoney(row.receivedAmount)},
          generated:history,
          computed,
          warnings
        });
        if(warnings.length){skipped++;continue;}
        if(!dryRun){
          const next=normalizeCourtRecord({...row,history,updatedAt:new Date().toISOString()},{schedules});
          await put(T_COURTS,row.id,next);
          migrated++;
        }
      }
      return sendJson(res,{dryRun,total:rows.length,candidates,migrated,skipped,preview});
    }
    const cM=path.match(/^\/courts\/(.+)$/);if(cM){const id=cM[1];if(method==='PUT'){const prev=await getCachedRow(T_COURTS,id).catch(()=>null);const prevHistory=JSON.stringify(normalizeCourtHistory(prev?.history));const nextHistory=JSON.stringify(normalizeCourtHistory(body?.history));const schedules=prevHistory===nextHistory?[]:await getCachedScan(T_SCHEDULE).catch(()=>[]);const r={...normalizeCourtRecord(body,{schedules}),id,updatedAt:new Date().toISOString()};await put(T_COURTS,id,r);return sendJson(res,r);}if(method==='DELETE'){const court=await getCachedRow(T_COURTS,id).catch(()=>null);if(!court)return sendJson(res,{error:'订场用户不存在'},404);const action=courtDeleteAction(court,await loadCourtDeleteReferenceData());if(action==='delete'){await del(T_COURTS,id);return sendJson(res,{success:true,archived:false});}const now=new Date().toISOString();await put(T_COURTS,id,{...court,status:'inactive',deletedAt:court.deletedAt||now,updatedAt:now});return sendJson(res,{success:true,archived:true});}}
    if(path==='/students'){await init();if(method==='GET'){const rows=await getCachedScan(T_STUDENTS);if(user.role==='admin')return sendJson(res,rows);const [schedule,classes]=await Promise.all([getCachedScan(T_SCHEDULE).catch(()=>[]),getCachedScan(T_CLASSES).catch(()=>[])]);return sendJson(res,filterLoadAllForUser({students:rows,schedule,classes},user).students);}if(method==='POST'){assertStudentWriteAccess(user);const id=uuidv4();const r={...body,phone:assertPhone(body.phone),id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put(T_STUDENTS,id,r);return sendJson(res,r);}}
    const sM=path.match(/^\/students\/(.+)$/);if(sM){const id=sM[1];if(method==='PUT'){assertStudentWriteAccess(user);const old=await get(T_STUDENTS,id).catch(()=>null);const r={...body,phone:assertPhone(body.phone),id,updatedAt:new Date().toISOString()};await put(T_STUDENTS,id,r);const studentUpdates=old?await applyStudentIdentityUpdate(old,r):{plans:[],schedule:[],purchases:[],entitlements:[],feedbacks:[]};return sendJson(res,{...r,studentUpdates});}if(method==='DELETE'){assertStudentWriteAccess(user);const [classes,schedule,plans,courts,feedbacks,purchases,entitlements,entitlementLedger]=await Promise.all([scan(T_CLASSES).catch(()=>[]),scan(T_SCHEDULE).catch(()=>[]),scan(T_PLANS).catch(()=>[]),scan(T_COURTS).catch(()=>[]),scanFeedbacks().catch(()=>[]),scan(T_PURCHASES).catch(()=>[]),scan(T_ENTITLEMENTS).catch(()=>[]),scan(T_ENTITLEMENT_LEDGER).catch(()=>[])]);assertCanDeleteStudent(id,{classes,schedule,plans,courts,feedbacks,purchases,entitlements,entitlementLedger});await del(T_STUDENTS,id);return sendJson(res,{success:true});}}
    if(path==='/init-data'&&method==='POST'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);await init();const ss=body.students||[];for(const s of ss)await put(T_STUDENTS,s.id||uuidv4(),{...s,updatedAt:new Date().toISOString()});return sendJson(res,{success:true,count:ss.length});}
    if(path==='/products'){await init();if(method==='GET')return sendJson(res,await getCachedScan(T_PRODUCTS).catch(()=>[]));if(method==='POST'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);const id=uuidv4();const now=new Date().toISOString();const r=normalizeProductRecord({...body,id},null,now);r.createdAt=now;await put(T_PRODUCTS,id,r);return sendJson(res,r);}}
    const pM=path.match(/^\/products\/(.+)$/);if(pM){const id=pM[1];if(method==='GET')return sendJson(res,await get(T_PRODUCTS,id));if(method==='PUT'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);const old=await get(T_PRODUCTS,id).catch(()=>null);if(!old)return sendJson(res,{error:'课程产品不存在'},404);const now=new Date().toISOString();const r=normalizeProductRecord({...body,id},old,now);const [classes,packages]=await Promise.all([scan(T_CLASSES).catch(()=>[]),scan(T_PACKAGES).catch(()=>[])]);assertCanEditProductWithReferences(old,r,{classes,packages});await put(T_PRODUCTS,id,r);const renamed=buildProductRenameDisplayUpdates(old,r,{classes},now);if(renamed.classes.length){const plans=await scan(T_PLANS).catch(()=>[]);const sync=buildProductRenameDisplayUpdates(old,r,{classes,plans},now);await Promise.all([...sync.classes.map(row=>put(T_CLASSES,row.id,row)),...sync.plans.map(row=>put(T_PLANS,row.id,row))]);}return sendJson(res,r);}if(method==='DELETE'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);const [classes,packages]=await Promise.all([scan(T_CLASSES),scan(T_PACKAGES).catch(()=>[])]);assertCanDeleteProduct(id,classes,packages);await del(T_PRODUCTS,id);return sendJson(res,{success:true});}}
    if(path==='/packages'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);await init();if(method==='GET')return sendJson(res,await getCachedScan(T_PACKAGES).catch(()=>[]));if(method==='POST'){const id=uuidv4();const refs={products:await getCachedScan(T_PRODUCTS).catch(()=>[]),coaches:await getCachedScan(T_COACHES).catch(()=>[]),campuses:await getCachedScan(T_CAMPUSES).catch(()=>[])};const now=new Date().toISOString();const r=normalizePackageRecord({...body,id},null,refs,now);r.createdAt=now;await put(T_PACKAGES,id,r);return sendJson(res,r);}}
    const pkgM=path.match(/^\/packages\/(.+)$/);if(pkgM){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);const id=pkgM[1];if(method==='GET')return sendJson(res,await get(T_PACKAGES,id));if(method==='PUT'){const old=await get(T_PACKAGES,id).catch(()=>null);if(!old)return sendJson(res,{error:'售卖课包不存在'},404);const refs={products:await scan(T_PRODUCTS).catch(()=>[]),coaches:await scan(T_COACHES).catch(()=>[]),campuses:await scan(T_CAMPUSES).catch(()=>[])};const r=normalizePackageRecord({...body,id},old,refs);assertCanEditPackageWithPurchases(old,r,await scan(T_PURCHASES).catch(()=>[]));await put(T_PACKAGES,id,r);return sendJson(res,r);}if(method==='DELETE'){assertCanDeletePackage(id,await scan(T_PURCHASES).catch(()=>[]));await del(T_PACKAGES,id);return sendJson(res,{success:true});}}
    if(path==='/purchases'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);await init();if(method==='GET')return sendJson(res,await getCachedScan(T_PURCHASES).catch(()=>[]));if(method==='POST'){const pkg=await get(T_PACKAGES,body.packageId).catch(()=>null);if(!pkg)return sendJson(res,{error:'售卖课包不存在'},404);const student=await get(T_STUDENTS,body.studentId).catch(()=>null);if(!student)return sendJson(res,{error:'学员不存在'},404);const purchaseDate=body.purchaseDate||new Date().toISOString().slice(0,10);validatePurchaseInputForPackage(pkg,{...body,purchaseDate});const id=uuidv4();const now=new Date().toISOString();const purchase=buildPurchaseRecord(pkg,{...body,purchaseDate},student,{id,now,operator:user.name});const entitlement=buildEntitlementFromPurchase(pkg,purchase,student,uuidv4(),now);await writePurchaseAndEntitlementAtomic({put,del},T_PURCHASES,T_ENTITLEMENTS,purchase,entitlement);return sendJson(res,{purchase,entitlement});}}
    const purM=path.match(/^\/purchases\/(.+)$/);if(purM){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);const id=purM[1];if(method==='GET')return sendJson(res,await get(T_PURCHASES,id));if(method==='PUT'){const old=await get(T_PURCHASES,id).catch(()=>null);if(!old)return sendJson(res,{error:'购买记录不存在'},404);const ents=(await scan(T_ENTITLEMENTS).catch(()=>[])).filter(e=>e.purchaseId===id);const ledger=await scan(T_ENTITLEMENT_LEDGER).catch(()=>[]);const now=new Date().toISOString();if(purchaseHasEntitlementLedger(id,ents,ledger)){const r={...old,notes:body.notes!==undefined?body.notes:old.notes,updatedAt:now};assertCanEditPurchaseWithLedger(old,r,ents,ledger);await put(T_PURCHASES,id,r);return sendJson(res,{purchase:r,entitlements:[]});}const nextPackageId=body.packageId||old.packageId;const purchaseDate=body.purchaseDate||old.purchaseDate||new Date().toISOString().slice(0,10);const pkg=await get(T_PACKAGES,nextPackageId).catch(()=>null);if(!pkg)return sendJson(res,{error:'售卖课包不存在'},404);validatePurchaseInputForPackage(pkg,{...old,...body,purchaseDate},{isEdit:true,oldPackageId:old.packageId});const student=await get(T_STUDENTS,body.studentId||old.studentId).catch(()=>null);if(!student)return sendJson(res,{error:'学员不存在'},404);const r=buildPurchaseRecord(pkg,{...old,...body,id,createdAt:old.createdAt,purchaseDate},student,{id,now,operator:old.operator||user.name});await put(T_PURCHASES,id,r);const synced=[];try{for(const ent of ents){const next=syncEntitlementFromPurchase(pkg,r,student,ent,now);await put(T_ENTITLEMENTS,ent.id,next);synced.push(next);}return sendJson(res,{purchase:r,entitlements:synced});}catch(err){await put(T_PURCHASES,id,old).catch(()=>null);for(const ent of ents)await put(T_ENTITLEMENTS,ent.id,ent).catch(()=>null);throw err;}}if(method==='DELETE'){const [ents,ledger]=await Promise.all([scan(T_ENTITLEMENTS).catch(()=>[]),scan(T_ENTITLEMENT_LEDGER).catch(()=>[])]);assertCanVoidPurchase(id,ents,ledger);const now=new Date().toISOString();for(const ent of ents.filter(e=>e.purchaseId===id)){await put(T_ENTITLEMENTS,ent.id,{...ent,status:'voided',updatedAt:now});const event={id:uuidv4(),entitlementId:ent.id,studentId:ent.studentId||'',purchaseId:id,lessonDelta:0,action:'void_purchase',reason:body.reason||'购买记录作废',operator:user.name||'',createdAt:now};await put(T_ENTITLEMENT_LEDGER,event.id,event);}const old=await get(T_PURCHASES,id).catch(()=>null);if(old)await put(T_PURCHASES,id,{...old,status:'voided',voidedAt:now,voidedBy:user.name||'',voidReason:body.reason||'购买记录作废',updatedAt:now});return sendJson(res,{success:true});}}
    if(path==='/membership-plans'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      if(method==='GET')return sendJson(res,await getCachedScan(T_MEMBERSHIP_PLANS).catch(()=>[]));
      if(method==='POST'){const now=new Date().toISOString();const r=buildMembershipPlanRecord(body,{id:uuidv4(),now});await put(T_MEMBERSHIP_PLANS,r.id,r);return sendJson(res,r);}
    }
    const mpM=path.match(/^\/membership-plans\/(.+)$/);if(mpM){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      const id=mpM[1];
      if(method==='GET')return sendJson(res,await getCachedRow(T_MEMBERSHIP_PLANS,id));
      if(method==='PUT'){const old=await getCachedRow(T_MEMBERSHIP_PLANS,id).catch(()=>null);if(!old)return sendJson(res,{error:'会员方案不存在'},404);const r=buildMembershipPlanRecord({...old,...body,id,createdAt:old.createdAt},{id,now:new Date().toISOString()});await put(T_MEMBERSHIP_PLANS,id,r);return sendJson(res,r);}
      if(method==='DELETE'){const old=await getCachedRow(T_MEMBERSHIP_PLANS,id).catch(()=>null);if(!old)return sendJson(res,{error:'会员方案不存在'},404);if(old.status==='active')return sendJson(res,{error:'上架中的会员方案不能删除，请先停售'},400);const orders=await getCachedScan(T_MEMBERSHIP_ORDERS).catch(()=>[]);if(orders.some(o=>o.membershipPlanId===id))return sendJson(res,{error:'该会员方案已有购买记录，不能删除，请停用'},400);await del(T_MEMBERSHIP_PLANS,id);return sendJson(res,{success:true});}
    }
    if(path==='/membership-accounts/reconcile'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      return sendJson(res,await runMembershipReconcile());
    }
    if(path==='/membership-accounts'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      if(method==='GET'){const rows=await getCachedScan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]);const courtId=query.get('courtId')||'';return sendJson(res,courtId?rows.filter(a=>a.courtId===courtId):rows);}
    }
    const maM=path.match(/^\/membership-accounts\/(.+)$/);if(maM){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      const id=maM[1];
      if(method==='GET')return sendJson(res,await getCachedRow(T_MEMBERSHIP_ACCOUNTS,id));
      if(method==='PUT'){
        const old=await getCachedRow(T_MEMBERSHIP_ACCOUNTS,id).catch(()=>null);
        if(!old)return sendJson(res,{error:'会员账户不存在'},404);
        const now=new Date().toISOString();
        const r={...old,...body,id,updatedAt:now};
        if(body.status==='voided'){
          r.status='voided';
          r.voidedAt=now;
          r.voidedBy=user.name||'';
          r.voidReason=body.voidReason||body.reason||'手动作废会员';
        }
        let event=null;
        if(old.status!==r.status&&r.status==='voided'){
          event=buildMembershipAccountEventRecord({
            membershipAccountId:id,
            courtId:r.courtId,
            eventType:'voided',
            beforeStatus:old.status,
            afterStatus:'voided',
            operator:user.name||'',
            reason:r.voidReason
          },{id:uuidv4(),now});
        }
        await put(T_MEMBERSHIP_ACCOUNTS,id,r);
        if(event)await put(T_MEMBERSHIP_ACCOUNT_EVENTS,event.id,event);
        return sendJson(res,event?{account:r,event}:r);
      }
    }
    if(path==='/membership-orders'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      if(method==='GET')return sendJson(res,await getCachedScan(T_MEMBERSHIP_ORDERS).catch(()=>[]));
      if(method==='POST'){
        const now=new Date().toISOString();
        const purchaseDate=body.purchaseDate||now.slice(0,10);
        const rechargeAmount=normalizeMoney(body.rechargeAmount);
        const requestReservationKey=reserveRecentMembershipOrderRequest({courtId:body.courtId,membershipPlanId:body.membershipPlanId,purchaseDate,rechargeAmount,requestKey:body.requestKey},now);
        if(!requestReservationKey)return sendJson(res,{error:'检测到重复提交，请勿重复开卡/续充'},409);
        const [court,plan,existingAccountFallback]=await Promise.all([
          getCachedRow(T_COURTS,body.courtId).catch(()=>null),
          getCachedRow(T_MEMBERSHIP_PLANS,body.membershipPlanId).catch(()=>null),
          body.membershipAccountId?getCachedRow(T_MEMBERSHIP_ACCOUNTS,body.membershipAccountId).catch(()=>null):Promise.resolve(null)
        ]);
        if(!court){releaseRecentMembershipOrderRequest(requestReservationKey);return sendJson(res,{error:'订场用户不存在'},404);}
        const existingAccount=existingAccountFallback&&existingAccountFallback.courtId===court.id&&existingAccountFallback.status!=='voided'
          ? existingAccountFallback
          : (await getCachedScan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[])).find(a=>a.courtId===court.id&&a.status!=='voided');
        if(!plan){releaseRecentMembershipOrderRequest(requestReservationKey);return sendJson(res,{error:'会员方案不存在'},404);}
        if(plan.status&&plan.status!=='active'){releaseRecentMembershipOrderRequest(requestReservationKey);return sendJson(res,{error:'该会员方案已停用'},400);}
        if(plan.saleStartDate&&purchaseDate<plan.saleStartDate){releaseRecentMembershipOrderRequest(requestReservationKey);return sendJson(res,{error:'未到会员方案售卖时间'},400);}
        if(plan.saleEndDate&&purchaseDate>plan.saleEndDate){releaseRecentMembershipOrderRequest(requestReservationKey);return sendJson(res,{error:'会员方案售卖时间已结束'},400);}
        const finalRechargeAmount=normalizeMoney(body.rechargeAmount??plan.rechargeAmount);
        const built=buildMembershipPurchase({court,plan:normalizeMembershipPlanViewRecord(plan),existingAccount,body:{...body,purchaseDate,rechargeAmount:finalRechargeAmount,operator:body.operator||user.name},now});
        const benefitLedgerRows=buildMembershipGrantLedgerRows(built.order,{idFactory:uuidv4,now});
        const originalCourt={...court};
        try{
          const history=[...normalizeCourtHistory(court.history),built.historyRow];
          const nextCourt=normalizeCourtRecord({...court,history,updatedAt:now});
          await Promise.all([
            put(T_MEMBERSHIP_ACCOUNTS,built.account.id,built.account),
            put(T_MEMBERSHIP_ORDERS,built.order.id,built.order),
            put(T_COURTS,court.id,nextCourt),
            ...benefitLedgerRows.map(row=>put(T_MEMBERSHIP_BENEFIT_LEDGER,row.id,row))
          ]);
          releaseRecentMembershipOrderRequest(requestReservationKey,{keep:true});
          return sendJson(res,{...built,benefitLedgerRows});
        }catch(err){
          await Promise.all([
            put(T_COURTS,originalCourt.id,originalCourt).catch(()=>null),
            del(T_MEMBERSHIP_ORDERS,built.order.id).catch(()=>null),
            ...benefitLedgerRows.map(row=>del(T_MEMBERSHIP_BENEFIT_LEDGER,row.id).catch(()=>null)),
            (!existingAccount?del(T_MEMBERSHIP_ACCOUNTS,built.account.id):put(T_MEMBERSHIP_ACCOUNTS,existingAccount.id,existingAccount)).catch(()=>null)
          ]);
          releaseRecentMembershipOrderRequest(requestReservationKey);
          throw err;
        }
      }
    }
    const moM=path.match(/^\/membership-orders\/(.+)$/);if(moM){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      const id=moM[1];
      if(method==='GET')return sendJson(res,await getCachedRow(T_MEMBERSHIP_ORDERS,id));
      if(method==='PUT'){const old=await getCachedRow(T_MEMBERSHIP_ORDERS,id).catch(()=>null);if(!old)return sendJson(res,{error:'会员购买记录不存在'},404);const r={...old,...body,id,updatedAt:new Date().toISOString()};await put(T_MEMBERSHIP_ORDERS,id,r);return sendJson(res,r);}
      if(method==='DELETE'){const old=await getCachedRow(T_MEMBERSHIP_ORDERS,id).catch(()=>null);if(old)await put(T_MEMBERSHIP_ORDERS,id,{...old,status:'voided',voidedAt:new Date().toISOString(),voidedBy:user.name||'',voidReason:body.reason||'会员购买记录作废',updatedAt:new Date().toISOString()});return sendJson(res,{success:true});}
    }
    if(path==='/membership-benefit-ledger'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      if(method==='GET'){
        const [rows,users]=await Promise.all([
          getCachedScan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[]),
          getCachedScan(T_USERS).catch(()=>[])
        ]);
        return sendJson(res,(rows||[]).map(row=>({...row,operator:normalizeOperatorAccountName(row.operator,users)})));
      }
      if(method==='POST'){
        const now=new Date().toISOString();
        const account=body.membershipAccountId?await getCachedRow(T_MEMBERSHIP_ACCOUNTS,body.membershipAccountId).catch(()=>null):null;
        const operator=body.operator||operatorAccountName(user);
        if(account&&['voided','cleared'].includes(account.status)&&['consume','supplement'].includes(body.action))return sendJson(res,{error:'当前会员状态不可再消耗或补发权益，请先重新开卡'},400);
        if(!body.membershipOrderId&&(body.action==='consume'||parseInt(body.delta)<0)){
          const [orders,ledger]=await Promise.all([getCachedScan(T_MEMBERSHIP_ORDERS).catch(()=>[]),getCachedScan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[])]);
          const relevantOrders=(orders||[]).filter(order=>order.membershipAccountId===body.membershipAccountId&&order.courtId===body.courtId);
          const needsPlanFallback=relevantOrders.some(order=>{
            const hasBenefitSnapshot=order?.benefitSnapshot&&Object.keys(order.benefitSnapshot).length>0;
            const hasPlanSnapshot=order?.planBenefitTemplateSnapshot&&Object.keys(order.planBenefitTemplateSnapshot).length>0;
            const hasLegacyCounts=MEMBERSHIP_BENEFIT_FIELD_MAP.some(({field})=>parseInt(order?.[field])>0);
            return !hasBenefitSnapshot&&!hasPlanSnapshot&&!hasLegacyCounts;
          });
          const plans=needsPlanFallback?await getCachedScan(T_MEMBERSHIP_PLANS).catch(()=>[]):[];
          const planMap=new Map((plans||[]).map(plan=>[plan.id,normalizeMembershipPlanViewRecord(plan)]));
          const normalizedOrders=relevantOrders.map(order=>normalizeMembershipOrderViewRecord(order,planMap.get(order.membershipPlanId)||null));
          const rows=allocateMembershipBenefitUsage({
            membershipAccountId:body.membershipAccountId,
            courtId:body.courtId,
            benefitCode:body.benefitCode,
            benefitLabel:body.benefitLabel,
            unit:body.unit,
            consumeCount:Math.abs(parseInt(body.delta)||0)||Math.abs(parseInt(body.consumeCount)||0),
            orders:normalizedOrders,
            ledger,
            relatedDate:body.relatedDate,
            reason:body.reason||'会员权益使用',
            operator,
            now,
            idFactory:uuidv4
          });
          await Promise.all(rows.map(row=>put(T_MEMBERSHIP_BENEFIT_LEDGER,row.id,row)));
          return sendJson(res,{records:rows});
        }
        const r=buildMembershipBenefitLedgerRecord({...body,operator},{id:uuidv4(),now});
        await put(T_MEMBERSHIP_BENEFIT_LEDGER,r.id,r);
        return sendJson(res,r);
      }
    }
    if(path==='/membership-account-events'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      if(method==='GET')return sendJson(res,await getCachedScan(T_MEMBERSHIP_ACCOUNT_EVENTS).catch(()=>[]));
    }
    if(path==='/entitlement-ledger'){
      await init();
      if(method==='GET')return sendJson(res,normalizeEntitlementLedgerRowsForView(await getCachedScan(T_ENTITLEMENT_LEDGER).catch(()=>[])));
    }
    if(path==='/entitlements'){await init();if(method==='GET'){const rows=await getCachedScan(T_ENTITLEMENTS).catch(()=>[]);const sid=query.get('studentId')||'';if(user.role==='admin')return sendJson(res,sid?rows.filter(e=>e.studentId===sid):rows);const [students,schedule,classes]=await Promise.all([getCachedScan(T_STUDENTS).catch(()=>[]),getCachedScan(T_SCHEDULE).catch(()=>[]),getCachedScan(T_CLASSES).catch(()=>[])]);const scoped=filterLoadAllForUser({students,schedule,classes,entitlements:rows},user).entitlements;return sendJson(res,sid?scoped.filter(e=>e.studentId===sid):scoped);}}
    if(path==='/entitlements/recommend'&&method==='POST'){await init();const rows=(await getCachedScan(T_ENTITLEMENTS).catch(()=>[])).filter(e=>parseArr(body.studentIds).includes(e.studentId));return sendJson(res,recommendEntitlements(rows,body));}
    const entM=path.match(/^\/entitlements\/(.+)$/);if(entM){const id=entM[1];if(method==='GET')return sendJson(res,await getCachedRow(T_ENTITLEMENTS,id));if(method==='DELETE'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);assertCanDeleteEntitlement(id,await scan(T_ENTITLEMENT_LEDGER).catch(()=>[]),await scan(T_ENTITLEMENTS).catch(()=>[]));await del(T_ENTITLEMENTS,id);return sendJson(res,{success:true});}}
    if(path==='/plans'){await init();if(method==='GET')return sendJson(res,await scan(T_PLANS));return sendJson(res,{error:'学习计划由班次自动生成，不能独立新增、修改或删除'},400);}
    const plM=path.match(/^\/plans\/(.+)$/);if(plM){const id=plM[1];if(method==='GET')return sendJson(res,await get(T_PLANS,id));return sendJson(res,{error:'学习计划由班次自动生成，不能独立新增、修改或删除'},400);}
    if(path==='/feedbacks'){
      await init();
      if(method==='GET')return sendJson(res,await withTimeout(getCachedScan(T_FEEDBACKS).catch(()=>[]),3000,[]));
      if(method==='POST'){
        const id=uuidv4();
        const schedule=await get(T_SCHEDULE,body.scheduleId).catch(()=>null);
        if(!schedule)return sendJson(res,{error:'排课不存在'},404);
        assertCanWriteFeedback(user,schedule);
        const r=buildFeedbackRecord(body,{id},user);
        await putFeedback(id,r);
        return sendJson(res,r);
      }
    }
    const fbM=path.match(/^\/feedbacks\/(.+)$/);
    if(fbM){
      const id=fbM[1];
      if(method==='GET')return sendJson(res,await get(T_FEEDBACKS,id));
      if(method==='PUT'){
        const ex=await get(T_FEEDBACKS,id).catch(()=>null);
        if(!ex)return sendJson(res,{error:'反馈不存在'},404);
        const schedule=await get(T_SCHEDULE,body.scheduleId||ex.scheduleId).catch(()=>null);
        if(!schedule)return sendJson(res,{error:'排课不存在'},404);
        assertCanWriteFeedback(user,schedule);
        const r=buildFeedbackRecord({...ex,...body},{...ex,id},user);
        await putFeedback(id,r);
        return sendJson(res,r);
      }
    }
    if(path==='/schedule'){
      await init();
      if(method==='GET'){const rows=await getCachedScan(T_SCHEDULE);return sendJson(res,user.role==='admin'?rows:filterLoadAllForUser({schedule:rows},user).schedule);}
      if(method==='POST'){
        try{assertCanWriteSchedule(user);}catch(e){return sendJson(res,{error:e.message},403);}
        const id=uuidv4();
        const r={...body,...normalizeCoachLateInfo(body),studentIds:parseArr(body.studentIds).filter(Boolean),expectedStudentIds:parseArr(body.expectedStudentIds).filter(Boolean),absentStudentIds:parseArr(body.absentStudentIds).filter(Boolean),venue:normalizeVenue(body.venue),id,status:body.status||'已排课',cancelReason:body.cancelReason||'',notifyStatus:body.notifyStatus||'未通知',confirmStatus:body.confirmStatus||'待确认',scheduleSource:body.scheduleSource||'排课表',createdBy:user.name,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
        const {risk,entitlementDeltas}=await timed('schedule create validate',async()=>{
          const risk=await validateScheduleSave(r,null);
          assertScheduleEntitlementRequired(r);
          const entitlementDeltas=resolveScheduleEntitlementDeltas(r,await getCachedScan(T_ENTITLEMENTS).catch(()=>[]));
          r.entitlementIds=entitlementDeltas.map(d=>d.entitlementId);
          r.entitlementId=r.entitlementIds.length===1?r.entitlementIds[0]:'';
          await assertScheduleEntitlementCapacity(r,null);
          return {risk,entitlementDeltas};
        });
        await timed('schedule create persist',()=>put(T_SCHEDULE,id,r));
        const nextDelta=scheduleLessonDelta(r);
        const appliedEntitlements=[];
        let lessonApplied=false;
        try{
          const entitlementChanged=await timed('schedule create entitlement writes',async()=>{
            const changed=[];
            for(const nextEntDelta of entitlementDeltas){
              const update=await applyEntitlementDelta(nextEntDelta.entitlementId,id,-nextEntDelta.delta,'consume','排课消课',user);
              if(update)changed.push(update);
              appliedEntitlements.push({entitlementId:nextEntDelta.entitlementId,delta:nextEntDelta.delta,action:'rollback',reason:'排课保存失败退回'});
            }
            return changed;
          });
          const lessonUpdate=nextDelta?await timed('schedule create lesson writes',()=>applyLessonDelta(nextDelta.classId,nextDelta.delta,r.studentIds)):null;
          if(nextDelta)lessonApplied=true;
          const entitlements=entitlementChanged.filter(Boolean).map(x=>x.entitlement);
          const entitlementLedger=entitlementChanged.filter(Boolean).map(x=>x.ledger);
          const notification=await notifyCoachScheduleCreated(r).catch(err=>({sent:false,error:err.message}));
          Object.assign(r,buildScheduleNotificationUpdate(r,notification,'schedule_created',new Date().toISOString()));
          await put(T_SCHEDULE,id,r);
          return sendJson(res,{schedule:r,warnings:risk.warnings||[],...(lessonUpdate||{}),entitlements,entitlementLedger,entitlement:entitlements[0]||null,ledger:entitlementLedger[0]||null,notification});
        }catch(err){
          await del(T_SCHEDULE,id).catch(()=>null);
          for(const item of appliedEntitlements)await applyEntitlementDelta(item.entitlementId,id,item.delta,item.action,item.reason,user).catch(()=>null);
          if(nextDelta&&lessonApplied)await applyLessonDelta(nextDelta.classId,-nextDelta.delta,r.studentIds).catch(()=>null);
          throw err;
        }
      }
    }
    const schM=path.match(/^\/schedule\/(.+)$/);
    if(schM){
      const id=schM[1];
      if(method==='GET')return sendJson(res,await get(T_SCHEDULE,id));
      if(method==='PUT'){
        try{assertCanWriteSchedule(user);}catch(e){return sendJson(res,{error:e.message},403);}
        const ex=await get(T_SCHEDULE,id).catch(()=>null);
        const r={...ex,...body,...normalizeCoachLateInfo({...ex,...body}),studentIds:parseArr(body.studentIds??ex?.studentIds).filter(Boolean),expectedStudentIds:parseArr(body.expectedStudentIds??ex?.expectedStudentIds).filter(Boolean),absentStudentIds:parseArr(body.absentStudentIds??ex?.absentStudentIds).filter(Boolean),venue:normalizeVenue(body.venue??ex?.venue),id,updatedAt:new Date().toISOString()};
        const oldDelta=scheduleLessonDelta(ex);
        const nextDelta=scheduleLessonDelta(r);
        const {risk,oldEntDeltas,nextEntDeltas}=await timed('schedule update validate',async()=>{
          const risk=await validateScheduleSave(r,ex);
          assertScheduleEntitlementRequired(r);
          assertScheduleEditableAfterFeedback(ex,r,await scanFeedbacks().catch(()=>[]));
          const oldEntDeltas=scheduleEntitlementDeltas(ex);
          const oldEntIds=new Set(oldEntDeltas.map(d=>d.entitlementId));
          const entitlementRows=await getCachedScan(T_ENTITLEMENTS).catch(()=>[]);
          const nextBaseRows=entitlementRows.map(ent=>oldEntIds.has(ent.id)?{...ent,status:'active',remainingLessons:parseLessonValue(ent.remainingLessons)+(oldEntDeltas.find(d=>d.entitlementId===ent.id)?.delta||0)}:ent);
          const nextEntDeltas=resolveScheduleEntitlementDeltas(r,nextBaseRows);
          r.entitlementIds=nextEntDeltas.map(d=>d.entitlementId);
          r.entitlementId=r.entitlementIds.length===1?r.entitlementIds[0]:'';
          await assertScheduleEntitlementCapacity(r,ex);
          return {risk,oldEntDeltas,nextEntDeltas};
        });
        await timed('schedule update persist',()=>put(T_SCHEDULE,id,r));
        const appliedEntitlements=[];
        const appliedClassDeltas=[];
        try{
          const changed=[];
          const entitlementChanged=await timed('schedule update entitlement writes',async()=>{
            const rows=[];
            const entDiff=diffScheduleEntitlementDeltas(oldEntDeltas,nextEntDeltas);
            for(const oldEntDelta of entDiff.returns){rows.push(await applyEntitlementDelta(oldEntDelta.entitlementId,id,oldEntDelta.delta,'return','编辑排课退回旧权益',user));appliedEntitlements.push({entitlementId:oldEntDelta.entitlementId,delta:-oldEntDelta.delta,action:'rollback',reason:'编辑排课失败重新扣旧权益'});}
            for(const nextEntDelta of entDiff.consumes){rows.push(await applyEntitlementDelta(nextEntDelta.entitlementId,id,-nextEntDelta.delta,'consume','编辑排课消课',user));appliedEntitlements.push({entitlementId:nextEntDelta.entitlementId,delta:nextEntDelta.delta,action:'rollback',reason:'编辑排课失败退回新权益'});}
            return rows;
          });
          await timed('schedule update lesson writes',async()=>{
            if(oldDelta){changed.push(await applyLessonDelta(oldDelta.classId,-oldDelta.delta,parseArr(ex.studentIds)));appliedClassDeltas.push({classId:oldDelta.classId,delta:oldDelta.delta,studentIds:parseArr(ex.studentIds)});}
            if(nextDelta){changed.push(await applyLessonDelta(nextDelta.classId,nextDelta.delta,r.studentIds));appliedClassDeltas.push({classId:nextDelta.classId,delta:-nextDelta.delta,studentIds:r.studentIds});}
          });
          const classes=changed.filter(Boolean).map(x=>x.class);
          const plans=changed.filter(Boolean).flatMap(x=>x.plans||[]);
          const entitlements=entitlementChanged.filter(Boolean).map(x=>x.entitlement);
          const entitlementLedger=entitlementChanged.filter(Boolean).map(x=>x.ledger);
          return sendJson(res,{schedule:r,classes,plans,entitlements,entitlementLedger,warnings:risk.warnings||[]});
        }catch(err){
          await put(T_SCHEDULE,id,ex).catch(()=>null);
          for(const item of appliedClassDeltas)await applyLessonDelta(item.classId,item.delta,item.studentIds).catch(()=>null);
          for(const item of appliedEntitlements)await applyEntitlementDelta(item.entitlementId,id,item.delta,item.action,item.reason,user).catch(()=>null);
          throw err;
        }
      }
      if(method==='DELETE'){
        const ex=await get(T_SCHEDULE,id).catch(()=>null);
        const oldDelta=scheduleLessonDelta(ex);
        assertCanDeleteSchedule(id,await scanFeedbacks(),await scan(T_ENTITLEMENT_LEDGER).catch(()=>[]));
        await del(T_SCHEDULE,id);
        try{
          const lessonUpdate=oldDelta?await applyLessonDelta(oldDelta.classId,-oldDelta.delta):null;
          return sendJson(res,{success:true,...(lessonUpdate||{})});
        }catch(err){
          if(ex)await put(T_SCHEDULE,id,ex).catch(()=>null);
          if(oldDelta)await applyLessonDelta(oldDelta.classId,oldDelta.delta).catch(()=>null);
          throw err;
        }
      }
    }
    if(path==='/coaches'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);await init();if(method==='GET')return sendJson(res,await getCachedScan(T_COACHES));if(method==='POST'){const id=uuidv4();const name=String(body.name||'').trim();if(!name)return sendJson(res,{error:'请填写教练姓名'},400);assertUniqueCoachName(name,await getCachedScan(T_COACHES));const r={...body,name,phone:assertPhone(body.phone),id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put(T_COACHES,id,r);return sendJson(res,r);}}
    const coM=path.match(/^\/coaches\/(.+)$/);if(coM){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);const id=coM[1];if(method==='PUT'){const old=await get(T_COACHES,id).catch(()=>null);if(!old)return sendJson(res,{error:'教练不存在'},404);const name=String(body.name||'').trim();if(!name)return sendJson(res,{error:'请填写教练姓名'},400);assertUniqueCoachName(name,await scan(T_COACHES),id);const r={...body,name,phone:assertPhone(body.phone),id,updatedAt:new Date().toISOString()};await put(T_COACHES,id,r);const coachUpdates=await applyCoachRename(old.name,name);return sendJson(res,{...r,coachUpdates});}if(method==='DELETE'){const old=await get(T_COACHES,id).catch(()=>null);if(!old)return sendJson(res,{success:true});assertCanDeleteCoachName(old.name,await loadCoachReferenceData(),old.id);await del(T_COACHES,id);return sendJson(res,{success:true});}}
    if(path==='/page-data/plans'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const [campuses,students,classes,plans,products,schedule,courts,entitlements]=await Promise.all([
        getCachedScan(T_CAMPUSES).catch(()=>[]),
        getCachedScan(T_STUDENTS).catch(()=>[]),
        getCachedScan(T_CLASSES).catch(()=>[]),
        getCachedScan(T_PLANS).catch(()=>[]),
        getCachedScan(T_PRODUCTS).catch(()=>[]),
        getCachedScan(T_SCHEDULE).catch(()=>[]),
        getCachedScan(T_COURTS).catch(()=>[]),
        getCachedScan(T_ENTITLEMENTS).catch(()=>[])
      ]);
      return sendJson(res,{
        campuses:campuses.length?campuses:DEFAULT_CAMPUSES,
        students,
        classes,
        plans,
        products,
        schedule,
        courts,
        entitlements
      });
    }
    if(path==='/page-data/purchases'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const [purchases,packages,students,entitlements]=await Promise.all([
        getCachedScan(T_PURCHASES).catch(()=>[]),
        getCachedScan(T_PACKAGES).catch(()=>[]),
        getCachedScan(T_STUDENTS).catch(()=>[]),
        getCachedScan(T_ENTITLEMENTS).catch(()=>[])
      ]);
      return sendJson(res,{purchases,packages,students,entitlements});
    }
    if(path==='/page-data/finance'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const [campuses,students,schedule,entitlements,entitlementLedger,financialLedger,coaches,products,purchases,packages,courts,membershipAccounts,membershipOrders,membershipBenefitLedger,membershipAccountEvents]=await Promise.all([
        listCampusesWithDefaults(),
        getCachedScan(T_STUDENTS).catch(()=>[]),
        getCachedScan(T_SCHEDULE).catch(()=>[]),
        getCachedScan(T_ENTITLEMENTS).catch(()=>[]),
        getCachedScan(T_ENTITLEMENT_LEDGER).catch(()=>[]),
        getCachedScan(T_FINANCIAL_LEDGER).catch(()=>[]),
        getCachedScan(T_COACHES).catch(()=>[]),
        getCachedScan(T_PRODUCTS).catch(()=>[]),
        getCachedScan(T_PURCHASES).catch(()=>[]),
        getCachedScan(T_PACKAGES).catch(()=>[]),
        getCachedScan(T_COURTS).catch(()=>[]),
        getCachedScan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]),
        getCachedScan(T_MEMBERSHIP_ORDERS).catch(()=>[]),
        getCachedScan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[]),
        getCachedScan(T_MEMBERSHIP_ACCOUNT_EVENTS).catch(()=>[])
      ]);
      return sendJson(res,{campuses,students,schedule,entitlements,entitlementLedger,financialLedger,coaches,products,purchases,packages,courts,membershipAccounts,membershipOrders,membershipBenefitLedger,membershipAccountEvents});
    }
    if(path==='/page-data/courts'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const [campuses,students,courts,membershipAccounts,coaches,pricePlans]=await Promise.all([
        listCampusesWithDefaults(),
        getCachedScan(T_STUDENTS).catch(()=>[]),
        getCachedScan(T_COURTS).catch(()=>[]),
        getCachedScan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]),
        getCachedScan(T_COACHES).catch(()=>[]),
        getCachedScan(T_PRICE_PLANS).catch(()=>[])
      ]);
      return sendJson(res,{campuses,students,courts,membershipAccounts,coaches,pricePlans});
    }
    if(path==='/page-data/memberships'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const [campuses,students,courts,membershipAccounts,membershipOrders,membershipBenefitLedger,membershipAccountEvents,membershipPlans,coaches]=await Promise.all([
        listCampusesWithDefaults(),
        getCachedScan(T_STUDENTS).catch(()=>[]),
        getCachedScan(T_COURTS).catch(()=>[]),
        getCachedScan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]),
        getCachedScan(T_MEMBERSHIP_ORDERS).catch(()=>[]),
        getCachedScan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[]),
        getCachedScan(T_MEMBERSHIP_ACCOUNT_EVENTS).catch(()=>[]),
        getCachedScan(T_MEMBERSHIP_PLANS).catch(()=>[]),
        getCachedScan(T_COACHES).catch(()=>[])
      ]);
      return sendJson(res,{campuses,students,courts,membershipAccounts,membershipOrders,membershipBenefitLedger,membershipAccountEvents,membershipPlans,coaches});
    }
    if(path==='/page-data/workbench'&&method==='GET'){
      await init();
      const [campuses,students,classes,schedule,feedbacks,purchases]=await Promise.all([
        listCampusesWithDefaults(),
        getCachedScan(T_STUDENTS).catch(()=>[]),
        getCachedScan(T_CLASSES).catch(()=>[]),
        getCachedScan(T_SCHEDULE).catch(()=>[]),
        withTimeout(scanFeedbacks().catch(()=>[]),3000,[]),
        getCachedScan(T_PURCHASES).catch(()=>[])
      ]);
      const scoped=filterLoadAllForUser({campuses,students,classes,schedule,feedbacks,purchases},user);
      const now=new Date();
      const decoratedStudents=decorateWorkbenchStudents(scoped.students||[],scoped.schedule||[],now);
      const decoratedFeedbacks=decorateWorkbenchFeedbacks(scoped.feedbacks||[]);
      const decoratedSchedule=decorateWorkbenchScheduleRows(scoped.schedule||[],decoratedFeedbacks,scoped.purchases||[],now);
      const decoratedClasses=decorateWorkbenchClasses(scoped.classes||[],scoped.schedule||[]);
      const stats=buildWorkbenchStats({schedule:decoratedSchedule,feedbacks:decoratedFeedbacks,purchases:scoped.purchases||[],now});
      return sendJson(res,{
        campuses:scoped.campuses||[],
        students:decoratedStudents,
        classes:decoratedClasses,
        schedule:decoratedSchedule,
        feedbacks:decoratedFeedbacks,
        stats
      });
    }
    if(path==='/classes'){await init();if(method==='GET'){const rows=await getCachedScan(T_CLASSES);if(user.role==='admin')return sendJson(res,rows);const schedule=await getCachedScan(T_SCHEDULE).catch(()=>[]);return sendJson(res,filterLoadAllForUser({classes:rows,schedule},user).classes);}if(method==='POST'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);assertCanWriteClass(user);const id=uuidv4();const now=new Date().toISOString();const [existingClasses,product]=await Promise.all([getCachedScan(T_CLASSES).catch(()=>[]),get(T_PRODUCTS,body.productId).catch(()=>null)]);if(!product)return sendJson(res,{error:'课程产品不存在'},404);validateClassInput({...body,usedLessons:0},product);const classNo=await reserveNextClassNo(existingClasses,user,now);const r=buildClassCreateRecord({...body,productName:product.name||body.productName||''},{id,classNo,user,now});await put(T_CLASSES,id,r);const syncedPlans=await syncClassPlans(id,r);return sendJson(res,{class:r,plans:syncedPlans});}}
    const clM=path.match(/^\/classes\/(.+)$/);if(clM){const id=clM[1];if(method==='GET')return sendJson(res,await get(T_CLASSES,id));if(method==='PUT'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);assertCanWriteClass(user);const old=await get(T_CLASSES,id).catch(()=>null);if(!old)return sendJson(res,{error:'班次不存在'},404);const product=await get(T_PRODUCTS,body.productId||old.productId).catch(()=>null);if(!product)return sendJson(res,{error:'课程产品不存在'},404);const r=buildClassUpdateRecord(old,body,{product,now:new Date().toISOString()});validateClassInput(r,product);assertCanEditClassWithSchedules(old,r,await getCachedScan(T_SCHEDULE));await put(T_CLASSES,id,r);const syncedPlans=await syncClassPlans(id,r);return sendJson(res,{class:r,plans:syncedPlans});}if(method==='DELETE'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);assertCanWriteClass(user);assertCanDeleteClass(id,await getCachedScan(T_SCHEDULE));const classPlans=(await getCachedScan(T_PLANS)).filter(p=>p.classId===id);for(const p of classPlans)await del(T_PLANS,p.id);await del(T_CLASSES,id);return sendJson(res,{success:true});}}
    if(path==='/campuses'){await init();if(method==='GET')return sendJson(res,await listCampusesWithDefaults());if(method==='POST'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);const id=body.code||uuidv4();const r={...body,id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put(T_CAMPUSES,id,r);return sendJson(res,r);}}
    const caM=path.match(/^\/campuses\/(.+)$/);if(caM){const id=caM[1];if(method==='PUT'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);const r={...body,id,updatedAt:new Date().toISOString()};await put(T_CAMPUSES,id,r);return sendJson(res,r);}if(method==='DELETE'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);const [students,coaches,classes,schedule,courts,packages,entitlements]=await Promise.all([scan(T_STUDENTS).catch(()=>[]),scan(T_COACHES).catch(()=>[]),scan(T_CLASSES).catch(()=>[]),scan(T_SCHEDULE).catch(()=>[]),scan(T_COURTS).catch(()=>[]),scan(T_PACKAGES).catch(()=>[]),scan(T_ENTITLEMENTS).catch(()=>[])]);assertCanDeleteCampus(id,{students,coaches,classes,schedule,courts,packages,entitlements});await del(T_CAMPUSES,id);return sendJson(res,{success:true});}}
    return sendJson(res,{error:'Not found'},404);
  }catch(e){console.error('API error:',e);return sendJson(res,{error:e.message},500);}
};

module.exports._test={
  MEMBERSHIP_TABLES,
  TEST_DATA_RESET_TABLES,
  scheduleLessonDelta,
  effectiveScheduleStatus,
  scheduleLessonChargeStatus,
  isScheduleLessonCharged,
  normalizeCoachLateInfo,
  buildCoachLateSettlementRows,
  assertClassSchedulable,
  assertLessonCapacity,
  validateScheduleConflicts,
  validateCourtBookingConflicts,
  buildEntitlementFromPurchase,
  buildPurchaseRecord,
  validateProductInput,
  normalizeProductRecord,
  validatePackageInput,
  normalizePackageRecord,
  validatePurchaseInputForPackage,
  assertCanEditProductWithReferences,
  assertCanEditPackageWithPurchases,
  assertCanEditPurchaseWithLedger,
  assertScheduleEntitlementRequired,
  scheduleParticipantSummary,
  collectMabaoSeedStaleRowIds,
  collectMabaoSeedImportedLedgerReplacementIds,
  collectDuplicateImportedLedgerIds,
  normalizeEntitlementLedgerRowsForView,
  syncEntitlementFromPurchase,
  writePurchaseAndEntitlementAtomic,
  validateEntitlementForSchedule,
  recommendEntitlements,
  scheduleEntitlementDeltas,
  resolveScheduleEntitlementDeltas,
  applyEntitlementLessonDelta,
  diffScheduleEntitlementDeltas,
  assertScheduleEditableAfterFeedback,
  isScheduleInsideDailyTimeWindows,
  scheduleEntitlementDelta,
  collectScheduleRiskWarnings,
  buildFeedbackRecord,
  assertCanWriteFeedback,
  buildFeedbackRecord,
  feedbackScopeForSchedule,
  assertCanWriteSchedule,
  filterLoadAllForUser,
  buildWorkbenchStats,
  resolveWorkbenchState,
  decorateWorkbenchClasses,
  decorateWorkbenchStudents,
  decorateWorkbenchFeedbacks,
  workbenchLessonUnits,
  assertPlanWriteForbidden,
  buildCoachRenameUpdates,
  buildStudentIdentityUpdates,
  buildProductRenameDisplayUpdates,
  assertCanDeleteCoachName,
  assertUniqueCoachName,
  assertAuthUserActive,
  mergeStoredAuthUser,
  userMatchPermissions,
  requireMatchAdminPermission,
  buildWechatCode2SessionUrl,
  extractWechatOpenId,
  buildWechatBoundUser,
  buildWechatUnboundUser,
  buildAdminUserView,
  buildWechatAccessTokenUrl,
  extractWechatAccessToken,
  fetchWechatPhoneNumber,
  findWechatScheduleRecipient,
  findWechatUserByOpenId,
  buildScheduleSubscribeMessage,
  buildScheduleNotificationUpdate,
  collectCourseReminderCandidates,
  buildCourseReminderSubscribeMessage,
  normalizeVenue,
  rangesOverlap,
  computeCourtFinance,
  summarizeCourtFinanceRevenue,
  buildMatchFinanceDailyReport,
  buildMatchCourtFinanceHistoryRow,
  buildMatchCourtFinanceRefundRow,
  normalizePricePlan,
  assertPricePlanInput,
  quoteVenuePrice,
  normalizeMembershipBenefitTemplate,
  buildMembershipPlanRecord,
  buildMembershipPurchase,
  summarizeMembershipBenefits,
  isDuplicateMembershipOrderSubmission,
  buildMembershipAccountEventRecord,
  buildMembershipBenefitLedgerRecord,
  buildMembershipGrantLedgerRows,
  allocateMembershipBenefitUsage,
  reconcileMembershipAccounts,
  mergeCourtRecords,
  normalizeMembershipPlanViewRecord,
  normalizeMembershipOrderViewRecord,
  isTransientStorageError,
  normalizeCourtRecord,
  buildLegacyCourtOpeningHistory,
  legacyCourtFinanceWarnings,
  extractDepositAmountFromText,
  importCourtRows,
  buildClassPlanRecord,
  assertCanDeleteProduct,
  assertCanDeleteClass,
  assertCanWriteClass,
  nextClassNoFromClasses,
  isClassNoReservationConflict,
  validateClassInput,
  buildClassCreateRecord,
  buildClassUpdateRecord,
  assertCanDeletePackage,
  assertCanVoidPurchase,
  assertCanDeleteEntitlement,
  assertStudentWriteAccess,
  assertCanEditClassWithSchedules,
  assertCanDeleteSchedule,
  assertCanDeleteStudent,
  assertCanDeleteCourt,
  courtDeleteAction,
  assertCanDeleteCampus,
  deleteCourtsByIds,
  getRuntimeEnsuredTables,
  getTestDataResetTables,
  clearTables
  ,MATCH_SQL_TABLES
  ,getMatchSqlPool
  ,requireAdminUser
  ,requireMatchUser
  ,buildMatchUserToken
  ,assertMatchPostInput
  ,normalizeMatchType
  ,matchTimelineStatus
  ,deriveMatchStatus
  ,splitAaFee
  ,registerMatchUser
  ,toMatchView
  ,toMatchDetailResponse
  ,matchStatusText
  ,assertMatchBookingInput
  ,assertBookedWithdrawalInput
  ,assertMatchFeeSplitUpdateInput
  ,assertMatchReplacementTransferInput
  ,resolveFinalAttendanceStatus
  ,buildMatchFeeLedger
  ,listMatchesForViewer
  ,getMatchForViewer
  ,createMatchForUser
  ,updateMatchForUser
  ,cancelMatchForUser
  ,cancelRegistrationForUser
  ,listAdminMatches
  ,adminBookMatch
  ,confirmMatchAttendance
  ,adminHandleBookedWithdrawal
  ,adminTransferMatchReplacement
  ,selfConfirmMatchAttendance
  ,creatorConfirmMatchAttendance
  ,generateMatchFeeLedger
  ,markMatchFeeSplit
  ,buildMatchProfileStats
  ,listMyMatches
  ,getMatchProfile
  ,updateMatchProfile
  ,listMatchNotifications
  ,matchNotificationText
  ,listMatchPlayers
  ,buildMatchSubscribeMessage
  ,notifyMatchUsers
  ,syncMatchFeeSplitToCourtFinance
  ,syncMatchFeeSplitRefundToCourtFinance
  ,getMatchFinanceDailyReportForAdmin
  ,getCourtRecordForTest
  ,removeMatchCourtFinanceRowsForTest
};
