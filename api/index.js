const TableStore = require('tablestore');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const JWT_SECRET = process.env.JWT_SECRET;
const TS_ENDPOINT = process.env.TS_ENDPOINT;
const TS_INSTANCE = process.env.TS_INSTANCE || 'flowtennis';
const TS_KEY_ID = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID;
const TS_KEY_SEC = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;
const REQUIRED_ENV_VARS = ['JWT_SECRET', 'TS_ENDPOINT', 'ALIBABA_CLOUD_ACCESS_KEY_ID', 'ALIBABA_CLOUD_ACCESS_KEY_SECRET'];
const ENABLE_DEFAULT_USER_BOOTSTRAP = process.env.ENABLE_DEFAULT_USER_BOOTSTRAP === 'true';
const ENABLE_TABLE_BOOTSTRAP = process.env.ENABLE_TABLE_BOOTSTRAP === 'true';

const T_USERS='ft_users',T_COURTS='ft_courts',T_STUDENTS='ft_students',T_PRODUCTS='ft_products',T_PLANS='ft_plans',T_SCHEDULE='ft_schedule',T_COACHES='ft_coaches',T_CLASSES='ft_classes',T_CAMPUSES='ft_campuses',T_FEEDBACKS='ft_feedbacks',T_PACKAGES='ft_packages',T_PURCHASES='ft_purchases',T_ENTITLEMENTS='ft_entitlements',T_ENTITLEMENT_LEDGER='ft_entitlement_ledger',T_MEMBERSHIP_PLANS='ft_membership_plans',T_MEMBERSHIP_ACCOUNTS='ft_membership_accounts',T_MEMBERSHIP_ORDERS='ft_membership_orders',T_MEMBERSHIP_BENEFIT_LEDGER='ft_membership_benefit_ledger',T_MEMBERSHIP_ACCOUNT_EVENTS='ft_membership_account_events';
const MEMBERSHIP_TABLES=[T_MEMBERSHIP_PLANS,T_MEMBERSHIP_ACCOUNTS,T_MEMBERSHIP_ORDERS,T_MEMBERSHIP_BENEFIT_LEDGER,T_MEMBERSHIP_ACCOUNT_EVENTS];
const RUNTIME_ENSURED_TABLES=[T_FEEDBACKS,T_PACKAGES,T_PURCHASES,T_ENTITLEMENTS,T_ENTITLEMENT_LEDGER,...MEMBERSHIP_TABLES];

let tsClient;
function gc(){if(!tsClient)tsClient=new TableStore.Client({accessKeyId:TS_KEY_ID,secretAccessKey:TS_KEY_SEC,endpoint:TS_ENDPOINT,instancename:TS_INSTANCE,maxRetries:3});return tsClient;}

function put(t,id,attrs){return new Promise((res,rej)=>{gc().putRow({tableName:t,condition:new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE,null),primaryKey:[{id:String(id)}],attributeColumns:Object.entries(attrs).filter(([k])=>k!=='id').map(([k,v])=>({[k]:typeof v==='object'?JSON.stringify(v):String(v??'')}))},( e,d)=>e?rej(e):res(d));});}
function get(t,id){return new Promise((res,rej)=>{gc().getRow({tableName:t,primaryKey:[{id:String(id)}],maxVersions:1},(e,d)=>{if(e)return rej(e);if(!d.row||!d.row.primaryKey)return res(null);const obj={id:d.row.primaryKey[0].value};(d.row.attributes||[]).forEach(a=>{try{obj[a.columnName]=JSON.parse(a.columnValue);}catch{obj[a.columnName]=a.columnValue;}});res(obj);});});}
function scan(t){return new Promise((res,rej)=>{const rows=[];function f(sk){gc().getRange({tableName:t,direction:TableStore.Direction.FORWARD,inclusiveStartPrimaryKey:sk||[{id:TableStore.INF_MIN}],exclusiveEndPrimaryKey:[{id:TableStore.INF_MAX}],maxVersions:1,limit:500},(e,d)=>{if(e)return rej(e);(d.rows||[]).forEach(r=>{if(!r.primaryKey)return;const obj={id:r.primaryKey[0].value};(r.attributes||[]).forEach(a=>{try{obj[a.columnName]=JSON.parse(a.columnValue);}catch{obj[a.columnName]=a.columnValue;}});rows.push(obj);});d.nextStartPrimaryKey?f(d.nextStartPrimaryKey):res(rows);});}f();});}
function del(t,id){return new Promise((res,rej)=>{gc().deleteRow({tableName:t,condition:new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE,null),primaryKey:[{id:String(id)}]},(e,d)=>e?rej(e):res(d));});}
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
function getRuntimeEnsuredTables(){return [...RUNTIME_ENSURED_TABLES];}
function parseArr(v){if(Array.isArray(v))return v;if(typeof v==='string'&&v){try{return JSON.parse(v)}catch{return[]}}return[];}
function isBillableSchedule(rec){return rec&&rec.status!=='已取消';}
async function applyLessonDelta(classId,delta){
  if(!classId||!delta)return null;
  const cls=await get(T_CLASSES,classId);
  if(!cls)return null;
  const oldClass={...cls};
  const nextUsed=Math.max(0,(parseInt(cls.usedLessons)||0)+delta);
  const relatedPlans=(await timed('scan plans for lesson delta',()=>scan(T_PLANS))).filter((p)=>p.classId===classId&&p.status==='active');
  const oldPlans=relatedPlans.map((p)=>({...p}));
  const updatedPlans=[];
  try{
    const nextClass={...cls,usedLessons:nextUsed,updatedAt:new Date().toISOString()};
    await put(T_CLASSES,classId,nextClass);
    for(const p of relatedPlans){
      const nextPlanUsed=Math.max(0,(parseInt(p.usedLessons)||0)+delta);
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
  if(!rec||!rec.classId||!isBillableSchedule(rec))return null;
  const lessonCount=parseInt(rec.lessonCount)||0;
  if(lessonCount<=0)return null;
  return {classId:rec.classId,delta:lessonCount};
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
  const total=parseInt(cls.totalLessons)||0;
  const used=parseInt(cls.usedLessons)||0;
  const oldSame=oldDelta&&oldDelta.classId===nextDelta.classId?(parseInt(oldDelta.delta)||0):0;
  const nextUsed=used-oldSame+(parseInt(nextDelta.delta)||0);
  if(total>0&&nextUsed>total)throw new Error(`剩余课时不足：剩余 ${Math.max(0,total-used+oldSame)} 节，本次消课 ${nextDelta.delta} 节`);
}
function validateScheduleConflicts(candidate,schedules,excludeId){
  if(!isBillableSchedule(candidate))return;
  if(!candidate.startTime)throw new Error('请选择上课时间');
  if(!candidate.endTime)throw new Error('请选择下课时间，系统需要用它校验冲突');
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
    packageTimeBand:pkg.timeBand||'',
    dailyTimeWindows:parseArr(pkg.dailyTimeWindows),
    coachIds:parseArr(pkg.coachIds),
    coachNames:parseArr(pkg.coachNames),
    campusIds:parseArr(pkg.campusIds),
    usageStartDate:pkg.usageStartDate||'',
    usageEndDate:pkg.usageEndDate||'',
    purchaseDate,
    amountPaid:normalizeMoney(body.amountPaid??pkg.price),
    payMethod:body.payMethod||'',
    operator:opts.operator||body.operator||'',
    status:body.status||'active',
    createdAt:body.createdAt||now,
    updatedAt:now
  };
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
function assertScheduleEntitlementRequired(rec){
  if(!isBillableSchedule(rec))return;
  const studentIds=parseArr(rec.studentIds).filter(Boolean);
  if(studentIds.length>1)throw new Error('多人排课暂不支持单个权益账户，请拆成单人排课或先升级一对多权益结构');
  if(!rec.entitlementId)throw new Error('排课必须绑定权益账户');
}
function syncEntitlementFromPurchase(pkg,purchase,student,oldEnt,now=new Date().toISOString()){
  const used=parseInt(oldEnt?.usedLessons)||0;
  const next=buildEntitlementFromPurchase(pkg,purchase,student,oldEnt?.id||uuidv4(),now);
  if(oldEnt?.createdAt)next.createdAt=oldEnt.createdAt;
  next.usedLessons=used;
  next.remainingLessons=(parseInt(next.totalLessons)||0)-used;
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
  if(!entitlement)throw new Error('请选择课包权益账户');
  if(entitlement.status&&entitlement.status!=='active')throw new Error('课包权益账户不可用');
  const lessonCount=parseInt(schedule.lessonCount)||1;
  if((parseInt(entitlement.remainingLessons)||0)<lessonCount)throw new Error('课包剩余课时不足');
  const studentIds=parseArr(schedule.studentIds);
  if(entitlement.studentId&&studentIds.length&&!studentIds.includes(entitlement.studentId))throw new Error('课包所属学员不匹配');
  if(entitlement.courseType&&schedule.courseType&&entitlement.courseType!==schedule.courseType)throw new Error('课程类型不匹配');
  const coachIds=parseArr(entitlement.coachIds);
  const coachNames=parseArr(entitlement.coachNames);
  if(coachIds.length&&schedule.coachId&&!coachIds.includes(schedule.coachId))throw new Error('课包可用教练不匹配');
  if(coachNames.length&&schedule.coach&&!coachNames.some(n=>sameCoachName(n,schedule.coach)))throw new Error('课包可用教练不匹配');
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
      remainingLessons:parseInt(ent.remainingLessons)||0,
      totalLessons:parseInt(ent.totalLessons)||0,
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
function applyEntitlementLessonDelta(entitlement,delta,now=new Date().toISOString()){
  const total=parseInt(entitlement.totalLessons)||0;
  const used=Math.max(0,(parseInt(entitlement.usedLessons)||0)-(parseInt(delta)||0));
  if(used>total)throw new Error('课包剩余课时不足');
  const remaining=Math.max(0,total-used);
  const status=remaining<=0?'depleted':(entitlement.status==='depleted'?'active':(entitlement.status||'active'));
  return {...entitlement,usedLessons:used,remainingLessons:remaining,status,updatedAt:now};
}
function assertScheduleEditableAfterFeedback(oldRec,nextRec,feedbacks){
  if(!oldRec||!nextRec)return;
  if(!(feedbacks||[]).some(f=>f.scheduleId===oldRec.id))return;
  const oldStudents=parseArr(oldRec.studentIds).sort();
  const nextStudents=parseArr(nextRec.studentIds).sort();
  const sameStudents=oldStudents.length===nextStudents.length&&oldStudents.every((id,idx)=>id===nextStudents[idx]);
  const sameStudentName=String(oldRec.studentName||'')===String(nextRec.studentName||'');
  const sameClass=String(oldRec.classId||'')===String(nextRec.classId||'');
  const sameEntitlement=String(oldRec.entitlementId||'')===String(nextRec.entitlementId||'');
  if(!sameStudents||!sameStudentName||!sameClass||!sameEntitlement){
    throw new Error('该排课已有课后反馈，不能修改学员、班次或权益账户');
  }
}
function scheduleEntitlementDelta(rec){
  if(!rec||!rec.entitlementId||!isBillableSchedule(rec))return null;
  const lessonCount=parseInt(rec.lessonCount)||1;
  if(lessonCount<=0)return null;
  return {entitlementId:rec.entitlementId,delta:lessonCount};
}
async function assertScheduleEntitlementCapacity(nextRec,oldRec){
  const nextDelta=scheduleEntitlementDelta(nextRec);
  if(!nextDelta)return null;
  const ent=await get(T_ENTITLEMENTS,nextDelta.entitlementId);
  if(!ent)throw new Error('课包权益账户不存在');
  const oldDelta=scheduleEntitlementDelta(oldRec);
  const adjusted=oldDelta&&oldDelta.entitlementId===nextDelta.entitlementId?{...ent,status:'active',remainingLessons:(parseInt(ent.remainingLessons)||0)+oldDelta.delta}:ent;
  validateEntitlementForSchedule(adjusted,nextRec);
  return adjusted;
}
async function applyEntitlementDelta(entitlementId,scheduleId,delta,action,reason,user){
  if(!entitlementId||!delta)return null;
  const ent=await get(T_ENTITLEMENTS,entitlementId);
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
function buildFeedbackRecord(body,base,user){
  if(!body.scheduleId)throw new Error('缺少排课ID');
  const now=new Date().toISOString();
  return {
    ...base,
    scheduleId:body.scheduleId,
    studentId:body.studentId||'',
    studentIds:parseArr(body.studentIds).filter(Boolean),
    studentName:body.studentName||'',
    coach:body.coach||user?.name||'',
    startTime:body.startTime||'',
    campus:body.campus||'',
    venue:body.venue||'',
    lessonCount:body.lessonCount||0,
    remainingLessons:body.remainingLessons||'',
    practicedToday:body.practicedToday||body.focus||body.performance||'',
    knowledgePoint:body.knowledgePoint||body.problems||'',
    nextTraining:body.nextTraining||body.nextAdvice||'',
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
    plans:Array.isArray(data?.plans)?data.plans:[],
    schedule:Array.isArray(data?.schedule)?data.schedule:[],
    coaches:Array.isArray(data?.coaches)?data.coaches:[],
    classes:Array.isArray(data?.classes)?data.classes:[],
    campuses:Array.isArray(data?.campuses)?data.campuses:[],
    feedbacks:Array.isArray(data?.feedbacks)?data.feedbacks:[]
  };
  if(user?.role==='admin')return normalized;
  const coachName=String(user?.coachName||user?.name||'').trim();
  const ownSchedule=normalized.schedule.filter(s=>String(s.coach||'').trim()===coachName);
  const scheduleIds=new Set(ownSchedule.map(s=>s.id).filter(Boolean));
  const scheduleClassIds=new Set(ownSchedule.map(s=>s.classId).filter(Boolean));
  const ownClasses=normalized.classes.filter(c=>String(c.coach||'').trim()===coachName||scheduleClassIds.has(c.id));
  const classIds=new Set([...ownClasses.map(c=>c.id).filter(Boolean),...scheduleClassIds]);
  const studentIds=new Set();
  ownSchedule.forEach(s=>parseArr(s.studentIds).forEach(id=>studentIds.add(id)));
  ownClasses.forEach(c=>parseArr(c.studentIds).forEach(id=>studentIds.add(id)));
  const ownPlans=normalized.plans.filter(p=>studentIds.has(p.studentId)||classIds.has(p.classId));
  ownPlans.forEach(p=>{if(p.studentId)studentIds.add(p.studentId);});
  const safeEntitlements=normalized.entitlements.filter(e=>studentIds.has(e.studentId)).map(e=>({
    id:e.id,studentId:e.studentId,studentName:e.studentName,packageName:e.packageName,courseType:e.courseType,totalLessons:e.totalLessons,usedLessons:e.usedLessons,remainingLessons:e.remainingLessons,validFrom:e.validFrom,validUntil:e.validUntil,timeBand:e.timeBand,status:e.status
  }));
  const safeLedger=normalized.entitlementLedger.filter(l=>scheduleIds.has(l.scheduleId)).map(l=>({
    id:l.id,entitlementId:l.entitlementId,studentId:l.studentId,scheduleId:l.scheduleId,lessonDelta:l.lessonDelta,action:l.action,reason:l.reason,createdAt:l.createdAt
  }));
  return {
    courts:[],
    students:normalized.students.filter(s=>studentIds.has(s.id)),
    products:normalized.products,
    packages:[],
    purchases:[],
    entitlements:safeEntitlements,
    entitlementLedger:safeLedger,
    membershipPlans:[],
    membershipAccounts:[],
    membershipOrders:[],
    membershipBenefitLedger:[],
    membershipAccountEvents:[],
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
  return {
    id:source.id||tokenUser?.id||'',
    name,
    role,
    coachId:source.coachId||tokenUser?.coachId||'',
    coachName:source.coachName||(role==='editor'?name:(tokenUser?.coachName||''))
  };
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
  const empty={plans:[],schedule:[],purchases:[],entitlements:[],feedbacks:[]};
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
    feedbacks:(data.feedbacks||[]).filter(r=>r.studentId===id||parseArr(r.studentIds).includes(id)).map(r=>touch({...r,studentName:name||r.studentName}))
  };
}
async function loadStudentReferenceData(){
  const [plans,schedule,purchases,entitlements,feedbacks]=await Promise.all([
    scan(T_PLANS).catch(()=>[]),
    scan(T_SCHEDULE).catch(()=>[]),
    scan(T_PURCHASES).catch(()=>[]),
    scan(T_ENTITLEMENTS).catch(()=>[]),
    withTimeout(scanFeedbacks().catch(()=>[]),3000,[])
  ]);
  return {plans,schedule,purchases,entitlements,feedbacks};
}
async function applyStudentIdentityUpdate(oldStudent,nextStudent){
  const updates=buildStudentIdentityUpdates(oldStudent,nextStudent,await loadStudentReferenceData());
  await Promise.all([
    ...updates.plans.map(r=>put(T_PLANS,r.id,r)),
    ...updates.schedule.map(r=>put(T_SCHEDULE,r.id,r)),
    ...updates.purchases.map(r=>put(T_PURCHASES,r.id,r)),
    ...updates.entitlements.map(r=>put(T_ENTITLEMENTS,r.id,r)),
    ...updates.feedbacks.map(r=>putFeedback(r.id,r))
  ]);
  return updates;
}
async function validateScheduleSave(nextRec,oldRec){
  const schedules=await timed('scan schedule for conflict check',()=>scan(T_SCHEDULE));
  validateScheduleConflicts(nextRec,schedules,nextRec.id);
  validateCourtBookingConflicts(nextRec,await timed('scan courts for schedule conflict check',()=>scan(T_COURTS).catch(()=>[])));
  const oldDelta=scheduleLessonDelta(oldRec);
  const nextDelta=scheduleLessonDelta(nextRec);
  if(nextDelta){
    const cls=await get(T_CLASSES,nextDelta.classId);
    assertLessonCapacity(cls,oldDelta,nextDelta);
  }
  return {warnings:collectScheduleRiskWarnings(nextRec,schedules,nextRec.id)};
}

let inited=false;
const DEFAULT_COACH_USERS=['baiyangj','chendand','yuekez','zhoux','sunmingy'];
async function bootstrapDefaultUsers(){
  if(!ENABLE_DEFAULT_USER_BOOTSTRAP)return;
  const us=[{id:'admin',name:'管理员',role:'admin',username:'admin'},{id:'baiyangj',name:'白杨静',role:'editor',username:'baiyangj'},{id:'chendand',name:'陈丹丹',role:'editor',username:'chendand'},{id:'yuekez',name:'岳克舟',role:'editor',username:'yuekez'},{id:'zhoux',name:'周欣',role:'editor',username:'zhoux'},{id:'sunmingy',name:'孙明玥',role:'editor',username:'sunmingy'}];
  const h=await bcrypt.hash('wqxd2026',10);
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
async function init(){
  if(inited)return;
  const startedAt=Date.now();
  const missing=REQUIRED_ENV_VARS.filter((k)=>!process.env[k]);
  if(missing.length)throw new Error('缺少环境变量：'+missing.join(', '));
  for(const t of RUNTIME_ENSURED_TABLES)await mkTable(t);
  if(ENABLE_TABLE_BOOTSTRAP){
    for(const t of[T_USERS,T_COURTS,T_STUDENTS,T_PRODUCTS,T_PLANS,T_SCHEDULE,T_COACHES,T_CLASSES,T_CAMPUSES,T_FEEDBACKS,T_PACKAGES,T_PURCHASES,T_ENTITLEMENTS,T_ENTITLEMENT_LEDGER])await mkTable(t);
    await bootstrapDefaultUsers();
    const defaultCampuses=[{id:'mabao',name:'顺义马坡',code:'mabao'},{id:'shilipu',name:'朝阳十里堡',code:'shilipu'},{id:'guowang',name:'朝阳国网',code:'guowang'},{id:'langang',name:'朝阳蓝色港湾',code:'langang'},{id:'chaojun',name:'朝珺私教',code:'chaojun'}];
    for(const c of defaultCampuses){
      const ex=await get(T_CAMPUSES,c.id).catch(()=>null);
      if(!ex)await put(T_CAMPUSES,c.id,{...c,createdAt:new Date().toISOString()});
    }
    await ensureCoachBindings();
  }
  inited=true;
  console.log(`[api-timing] init cold start ${Date.now()-startedAt}ms`);
}

function sendJson(res,body,code=200){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
  res.status(code).json(body);
}
function authUser(req){const token=(req.headers.authorization||'').replace('Bearer ','');if(!token)return null;try{return jwt.verify(token,JWT_SECRET);}catch{return null;}}
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
function normalizeCourtHistory(history){
  if(!Array.isArray(history))return[];
  return history.map((h)=> {
    const amountRaw=normalizeMoney(h.amount);
    const type=h.type||'消费';
    const payMethod=h.payMethod||(type==='消费'&&amountRaw<0?'储值扣款':'');
    return {
      ...h,
      type,
      payMethod,
      category:h.category||'其他',
      studentId:h.studentId||'',
      amount:Math.abs(amountRaw),
      bonusAmount:normalizeMoney(h.bonusAmount)
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
    totalLessons:parseInt(cls.totalLessons)||0,
    usedLessons:parseInt(cls.usedLessons)||0,
    status:classStatusToPlanStatus(cls.status)
  };
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
  if((ledger||[]).some(l=>l.entitlementId===entitlementId))throw new Error('该权益账户已有消耗记录，不能删除');
  if((entitlements||[]).some(e=>e.id===entitlementId&&e.purchaseId))throw new Error('该权益账户来自购买记录，不能删除');
}
function sameStudentIds(a,b){
  const x=parseArr(a).filter(Boolean).sort();
  const y=parseArr(b).filter(Boolean).sort();
  return x.length===y.length&&x.every((id,i)=>id===y[i]);
}
function assertCanEditClassWithSchedules(oldClass,nextClass,schedules){
  if(!(schedules||[]).some(s=>s.classId===oldClass?.id))return;
  if(String(oldClass?.coach||'').trim()!==String(nextClass?.coach||'').trim()||!sameStudentIds(oldClass?.studentIds,nextClass?.studentIds)){
    throw new Error('该班次已有排课，不能直接修改教练或学员');
  }
}
function assertCanDeleteSchedule(scheduleId,feedbacks,ledger=[]){
  if((feedbacks||[]).some(f=>f.scheduleId===scheduleId))throw new Error('该排课已有课后反馈，不能直接删除');
  if((ledger||[]).some(l=>l.scheduleId===scheduleId))throw new Error('该排课已有权益消耗记录，不能直接删除，请取消排课');
}
function assertCanDeleteStudent(studentId,data){
  if(!studentId)return;
  const used=
    (data.classes||[]).some(c=>parseArr(c.studentIds).includes(studentId))||
    (data.schedule||[]).some(s=>parseArr(s.studentIds).includes(studentId))||
    (data.plans||[]).some(p=>p.studentId===studentId)||
    (data.purchases||[]).some(p=>p.studentId===studentId)||
    (data.entitlements||[]).some(e=>e.studentId===studentId)||
    (data.entitlementLedger||[]).some(l=>l.studentId===studentId)||
    (data.courts||[]).some(c=>c.studentId===studentId||parseArr(c.studentIds).includes(studentId)||normalizeCourtHistory(c.history).some(h=>h.studentId===studentId))||
    (data.feedbacks||[]).some(f=>f.studentId===studentId||parseArr(f.studentIds).includes(studentId));
  if(used)throw new Error('该学员已有班次、排课、学习计划、订场账户或反馈关联，不能直接删除');
}
function assertCanDeleteCourt(court){
  if(parseArr(court?.history).length)throw new Error('该客户已有财务流水，不能直接删除');
  if(normalizeMoney(court?.balance)||normalizeMoney(court?.totalDeposit)||normalizeMoney(court?.spentAmount))throw new Error('该客户已有财务数据，不能直接删除');
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
async function syncClassPlans(classId,cls){
  const studentIds=parseArr(cls.studentIds);
  const [students,existingPlans]=await Promise.all([
    timed('sync class plans scan students',()=>scan(T_STUDENTS)),
    timed('sync class plans scan plans',()=>scan(T_PLANS))
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
function normalizeCourtRecord(input){
  const inferredDeposit=extractDepositAmountFromText(input.depositAttitude);
  const normalizedInput={...input};
  if(inferredDeposit>0&&!normalizeMoney(normalizedInput.totalDeposit))normalizedInput.totalDeposit=inferredDeposit;
  if(inferredDeposit>0&&!hasMoneyValue(input.balance)){
    const spent=normalizeMoney(normalizedInput.spentAmount);
    const total=normalizeMoney(normalizedInput.totalDeposit);
    if(spent>0&&total>0)normalizedInput.balance=Math.max(0,total-spent);
  }
  const currentHistory=normalizeCourtHistory(input.history);
  const history=currentHistory.length?currentHistory:buildLegacyCourtOpeningHistory(normalizedInput);
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
    status:input.status||'active',
    notes:input.notes||'',
    createdAt:input.createdAt||now,
    updatedAt:now
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
  const rechargeAmount=normalizeMoney(body.rechargeAmount??plan.rechargeAmount);
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
  const benefitSnapshot=normalizeMembershipBenefitTemplate({
    ...plan,
    ...body,
    publicLessonCount:body.publicLessonCount??purchaseBenefitTemplate.publicLesson?.count??plan.publicLessonCount,
    stringingLaborCount:body.stringingLaborCount??purchaseBenefitTemplate.stringingLabor?.count??plan.stringingLaborCount,
    ballMachineCount:body.ballMachineCount??purchaseBenefitTemplate.ballMachine?.count??plan.ballMachineCount,
    level2PartnerCount:body.level2PartnerCount??purchaseBenefitTemplate.level2Partner?.count??plan.level2PartnerCount,
    designatedCoachPartnerCount:body.designatedCoachPartnerCount??purchaseBenefitTemplate.designatedCoachPartner?.count??plan.designatedCoachPartnerCount,
    benefitTemplate:purchaseBenefitTemplate,
    customBenefits:body.customBenefits??purchaseBenefitTemplate.customBenefits??plan.customBenefits??plan.benefitTemplate?.customBenefits,
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
    rechargeAmount,
    bonusAmount:normalizeMoney(body.bonusAmount??plan.bonusAmount),
    discountRate:account.discountRate,
    purchaseDate,
    effectiveDate:body.effectiveDate||purchaseDate,
    cycleStartDate:range.cycleStartDate,
    validUntil:range.validUntil,
    hardExpireAt:range.hardExpireAt,
    qualifiesRenewalReset,
    benefitSnapshot,
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
    discountRate:account.discountRate,
    originalAmount:0,
    discountedAmount:0,
    note:body.note||`${plan.name||'会员'}开卡/续充`
  };
  const warning=oldAccount&&inTerm&&!qualifiesRenewalReset?'低于原会员档位，已记录充值但不重置会员有效期':'';
  return {account,order,historyRow,warning};
}
function membershipBenefitItemsFromOrder(order){
  const snap=order?.benefitSnapshot||{};
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
    const delta=(ledger||[]).filter(l=>l.membershipOrderId===item.membershipOrderId&&l.benefitCode===item.benefitCode).reduce((sum,l)=>sum+(parseInt(l.delta)||0),0);
    const expired=item.benefitValidUntil&&today>item.benefitValidUntil;
    return {...item,used:Math.abs(Math.min(0,delta)),adjusted:Math.max(0,delta),remaining:expired?0:Math.max(0,item.total+delta),status:expired?'expired':'active'};
  }));
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
async function deleteCourtsByIds(ids){
  const uniqueIds=[...new Set((ids||[]).map(id=>String(id||'').trim()).filter(Boolean))];
  const deleted=[],errors=[];
  for(let i=0;i<uniqueIds.length;i+=10){
    const chunk=uniqueIds.slice(i,i+10);
    const results=await Promise.all(chunk.map(async(id)=>{
      try{
        const court=await get(T_COURTS,id).catch(()=>null);
        assertCanDeleteCourt(court);
        await del(T_COURTS,id);
        return {id,ok:true};
      }catch(e){
        return {id,ok:false,error:e.message};
      }
    }));
    results.forEach(r=>r.ok?deleted.push(r.id):errors.push({id:r.id,error:r.error}));
  }
  return {success:deleted.length,failed:errors.length,deleted,errors};
}
async function clearAllCourts(){
  const existing=await scan(T_COURTS);
  for(let i=0;i<existing.length;i+=20)await Promise.all(existing.slice(i,i+20).map(r=>del(T_COURTS,r.id)));
  return existing.length;
}
async function importCourtRows(rows){
  let success=0,failed=0;
  const errors=[];
  for(const row of rows){
    try{
      const id=uuidv4();
      const record={...normalizeCourtRecord(row),id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
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
  const accounts=Array.isArray(rows?.accounts)?rows.accounts:await scan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]);
  const courts=Array.isArray(rows?.courts)?rows.courts:await scan(T_COURTS).catch(()=>[]);
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
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');return res.status(200).end();}
  const path=(req.url||'').replace(/^\/api/,'').split('?')[0];
  const query=new URL(req.url||'/', 'http://local').searchParams;
  const method=req.method;
  const startedAt=Date.now();
  if(res&&typeof res.on==='function')res.on('finish',()=>{console.log(`[api] ${method} ${path} ${res.statusCode} ${Date.now()-startedAt}ms`);});
  const body=req.body||{};
  try{
    if(path==='/health')return sendJson(res,{status:'ok',time:new Date().toISOString()});
    if(path==='/auth/login'&&method==='POST'){await init();const{username,password}=body;if(!username||!password)return sendJson(res,{error:'请填写账号和密码'},400);const user=await get(T_USERS,username);if(!user||!await bcrypt.compare(password,user.password))return sendJson(res,{error:'账号或密码错误'},401);const payload=mergeStoredAuthUser(null,user);const token=jwt.sign(payload,JWT_SECRET,{expiresIn:'7d'});return sendJson(res,{token,user:payload});}
    let user=authUser(req);if(!user)return sendJson(res,{error:'未登录'},401);
    const storedAuthUser=await get(T_USERS,user.id).catch(()=>null);
    user=mergeStoredAuthUser(user,storedAuthUser);
    if(path==='/admin/create-user'&&method==='POST'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);await init();const{id,name,password,role,coachId,coachName}=body;if(!id||!name||!password)return sendJson(res,{error:'缺少必填字段'},400);const nextRole=role||'editor';const hashed=await bcrypt.hash(password,10);const nextCoachName=coachName||(nextRole==='editor'?name:'');await put(T_USERS,id,{id,name,password:hashed,role:nextRole,coachId:coachId||'',coachName:nextCoachName});return sendJson(res,{success:true,id,name,role:nextRole,coachId:coachId||'',coachName:nextCoachName});}
    if(path==='/admin/update-user'&&method==='POST'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);await init();const{id,coachId,coachName}=body;if(!id)return sendJson(res,{error:'缺少用户ID'},400);const u=await get(T_USERS,id);if(!u)return sendJson(res,{error:'用户不存在'},404);const updates={...u,coachId:coachId||''};if(body.name)updates.name=body.name;updates.coachName=coachName||(u.role==='editor'?(updates.name||u.name):'');await put(T_USERS,id,updates);return sendJson(res,{success:true});}
    if(path==='/admin/users'&&method==='GET'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);await init();const all=await scan(T_USERS);return sendJson(res,all.map(u=>({id:u.id,name:u.name,role:u.role,coachId:u.coachId||'',coachName:u.coachName||''})));}
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
    if(path==='/auth/me')return sendJson(res,user);
    if(path==='/load-all'&&method==='GET'){
      await init();
      const [rawCourts,students,products,packages,purchases,entitlements,entitlementLedger,membershipPlans,membershipAccounts,membershipOrders,membershipBenefitLedger,membershipAccountEvents,plans,schedule,coaches,classes,campuses,feedbacks]=await Promise.all([
        timed('load-all scan courts',()=>scan(T_COURTS)),
        timed('load-all scan students',()=>scan(T_STUDENTS)),
        timed('load-all scan products',()=>scan(T_PRODUCTS)),
        timed('load-all scan packages',()=>scan(T_PACKAGES).catch(()=>[])),
        timed('load-all scan purchases',()=>scan(T_PURCHASES).catch(()=>[])),
        timed('load-all scan entitlements',()=>scan(T_ENTITLEMENTS).catch(()=>[])),
        timed('load-all scan entitlement ledger',()=>scan(T_ENTITLEMENT_LEDGER).catch(()=>[])),
        timed('load-all scan membership plans',()=>scan(T_MEMBERSHIP_PLANS).catch(()=>[])),
        timed('load-all scan membership accounts',()=>scan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[])),
        timed('load-all scan membership orders',()=>scan(T_MEMBERSHIP_ORDERS).catch(()=>[])),
        timed('load-all scan membership benefit ledger',()=>scan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[])),
        timed('load-all scan membership account events',()=>scan(T_MEMBERSHIP_ACCOUNT_EVENTS).catch(()=>[])),
        timed('load-all scan plans',()=>scan(T_PLANS)),
        timed('load-all scan schedule',()=>scan(T_SCHEDULE)),
        timed('load-all scan coaches',()=>scan(T_COACHES).catch(()=>[])),
        timed('load-all scan classes',()=>scan(T_CLASSES).catch(()=>[])),
        timed('load-all scan campuses',()=>scan(T_CAMPUSES).catch(()=>[])),
        timed('load-all scan feedbacks',()=>withTimeout(scanFeedbacks().catch(()=>[]),3000,[]))
      ]);
      const reconciled=await runMembershipReconcile({accounts:membershipAccounts,courts:rawCourts});
      const courts=reconciled.courts||rawCourts;
      const loaded=filterLoadAllForUser({
        courts:Array.isArray(courts)?courts:[],
        students:Array.isArray(students)?students:[],
        products:Array.isArray(products)?products:[],
        packages:Array.isArray(packages)?packages:[],
        purchases:Array.isArray(purchases)?purchases:[],
        entitlements:Array.isArray(entitlements)?entitlements:[],
        entitlementLedger:Array.isArray(entitlementLedger)?entitlementLedger:[],
        membershipPlans:Array.isArray(membershipPlans)?membershipPlans:[],
        membershipAccounts:Array.isArray(reconciled.accounts)?reconciled.accounts:[],
        membershipOrders:Array.isArray(membershipOrders)?membershipOrders:[],
        membershipBenefitLedger:Array.isArray(membershipBenefitLedger)?membershipBenefitLedger:[],
        membershipAccountEvents:[...(Array.isArray(membershipAccountEvents)?membershipAccountEvents:[]),...(reconciled.events||[])],
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
    if(path==='/courts'){
      await init();
      if(method==='GET')return sendJson(res,await scan(T_COURTS));
      if(method==='POST'){
        const id=uuidv4();
        const r={...normalizeCourtRecord(body),id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
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
      const result=await deleteCourtsByIds(body.ids);
      return sendJson(res,result);
    }
    if(path==='/courts/migrate-legacy'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const dryRun=body?.dryRun!==false;
      const rows=await scan(T_COURTS);
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
      const rows=await scan(T_COURTS);
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
          const next=normalizeCourtRecord({...row,history,updatedAt:new Date().toISOString()});
          await put(T_COURTS,row.id,next);
          migrated++;
        }
      }
      return sendJson(res,{dryRun,total:rows.length,candidates,migrated,skipped,preview});
    }
    const cM=path.match(/^\/courts\/(.+)$/);if(cM){const id=cM[1];if(method==='PUT'){const r={...normalizeCourtRecord(body),id,updatedAt:new Date().toISOString()};await put(T_COURTS,id,r);return sendJson(res,r);}if(method==='DELETE'){const court=await get(T_COURTS,id).catch(()=>null);assertCanDeleteCourt(court);await del(T_COURTS,id);return sendJson(res,{success:true});}}
    if(path==='/students'){await init();if(method==='GET')return sendJson(res,await scan(T_STUDENTS));if(method==='POST'){const id=uuidv4();const r={...body,phone:assertPhone(body.phone),id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put(T_STUDENTS,id,r);return sendJson(res,r);}}
    const sM=path.match(/^\/students\/(.+)$/);if(sM){const id=sM[1];if(method==='PUT'){const old=await get(T_STUDENTS,id).catch(()=>null);const r={...body,phone:assertPhone(body.phone),id,updatedAt:new Date().toISOString()};await put(T_STUDENTS,id,r);const studentUpdates=old?await applyStudentIdentityUpdate(old,r):{plans:[],schedule:[],purchases:[],entitlements:[],feedbacks:[]};return sendJson(res,{...r,studentUpdates});}if(method==='DELETE'){const [classes,schedule,plans,courts,feedbacks,purchases,entitlements,entitlementLedger]=await Promise.all([scan(T_CLASSES).catch(()=>[]),scan(T_SCHEDULE).catch(()=>[]),scan(T_PLANS).catch(()=>[]),scan(T_COURTS).catch(()=>[]),scanFeedbacks().catch(()=>[]),scan(T_PURCHASES).catch(()=>[]),scan(T_ENTITLEMENTS).catch(()=>[]),scan(T_ENTITLEMENT_LEDGER).catch(()=>[])]);assertCanDeleteStudent(id,{classes,schedule,plans,courts,feedbacks,purchases,entitlements,entitlementLedger});await del(T_STUDENTS,id);return sendJson(res,{success:true});}}
    if(path==='/init-data'&&method==='POST'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);await init();const ss=body.students||[];for(const s of ss)await put(T_STUDENTS,s.id||uuidv4(),{...s,updatedAt:new Date().toISOString()});return sendJson(res,{success:true,count:ss.length});}
    if(path==='/products'){await init();if(method==='GET')return sendJson(res,await scan(T_PRODUCTS));if(method==='POST'){const id=uuidv4();const r={...body,id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put(T_PRODUCTS,id,r);return sendJson(res,r);}}
    const pM=path.match(/^\/products\/(.+)$/);if(pM){const id=pM[1];if(method==='GET')return sendJson(res,await get(T_PRODUCTS,id));if(method==='PUT'){const old=await get(T_PRODUCTS,id).catch(()=>null);if(!old)return sendJson(res,{error:'课程产品不存在'},404);const r={...body,id,updatedAt:new Date().toISOString()};const [classes,packages]=await Promise.all([scan(T_CLASSES).catch(()=>[]),scan(T_PACKAGES).catch(()=>[])]);assertCanEditProductWithReferences(old,r,{classes,packages});await put(T_PRODUCTS,id,r);return sendJson(res,r);}if(method==='DELETE'){const [classes,packages]=await Promise.all([scan(T_CLASSES),scan(T_PACKAGES).catch(()=>[])]);assertCanDeleteProduct(id,classes,packages);await del(T_PRODUCTS,id);return sendJson(res,{success:true});}}
    if(path==='/packages'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);await init();if(method==='GET')return sendJson(res,await scan(T_PACKAGES).catch(()=>[]));if(method==='POST'){const id=uuidv4();const refs={products:await scan(T_PRODUCTS).catch(()=>[]),coaches:await scan(T_COACHES).catch(()=>[]),campuses:await scan(T_CAMPUSES).catch(()=>[])};const now=new Date().toISOString();const r=normalizePackageRecord({...body,id},null,refs,now);r.createdAt=now;await put(T_PACKAGES,id,r);return sendJson(res,r);}}
    const pkgM=path.match(/^\/packages\/(.+)$/);if(pkgM){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);const id=pkgM[1];if(method==='GET')return sendJson(res,await get(T_PACKAGES,id));if(method==='PUT'){const old=await get(T_PACKAGES,id).catch(()=>null);if(!old)return sendJson(res,{error:'售卖课包不存在'},404);const refs={products:await scan(T_PRODUCTS).catch(()=>[]),coaches:await scan(T_COACHES).catch(()=>[]),campuses:await scan(T_CAMPUSES).catch(()=>[])};const r=normalizePackageRecord({...body,id},old,refs);assertCanEditPackageWithPurchases(old,r,await scan(T_PURCHASES).catch(()=>[]));await put(T_PACKAGES,id,r);return sendJson(res,r);}if(method==='DELETE'){assertCanDeletePackage(id,await scan(T_PURCHASES).catch(()=>[]));await del(T_PACKAGES,id);return sendJson(res,{success:true});}}
    if(path==='/purchases'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);await init();if(method==='GET')return sendJson(res,await scan(T_PURCHASES).catch(()=>[]));if(method==='POST'){const pkg=await get(T_PACKAGES,body.packageId).catch(()=>null);if(!pkg)return sendJson(res,{error:'售卖课包不存在'},404);if(pkg.status&&pkg.status!=='active')return sendJson(res,{error:'该课包已停用'},400);const student=await get(T_STUDENTS,body.studentId).catch(()=>null);if(!student)return sendJson(res,{error:'学员不存在'},404);const purchaseDate=body.purchaseDate||new Date().toISOString().slice(0,10);if(pkg.saleStartDate&&purchaseDate<pkg.saleStartDate)return sendJson(res,{error:'不在课包活动购买时间内'},400);if(pkg.saleEndDate&&purchaseDate>pkg.saleEndDate)return sendJson(res,{error:'不在课包活动购买时间内'},400);const id=uuidv4();const now=new Date().toISOString();const purchase=buildPurchaseRecord(pkg,{...body,purchaseDate},student,{id,now,operator:user.name});const entitlement=buildEntitlementFromPurchase(pkg,purchase,student,uuidv4(),now);await writePurchaseAndEntitlementAtomic({put,del},T_PURCHASES,T_ENTITLEMENTS,purchase,entitlement);return sendJson(res,{purchase,entitlement});}}
    const purM=path.match(/^\/purchases\/(.+)$/);if(purM){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);const id=purM[1];if(method==='GET')return sendJson(res,await get(T_PURCHASES,id));if(method==='PUT'){const old=await get(T_PURCHASES,id).catch(()=>null);if(!old)return sendJson(res,{error:'购买记录不存在'},404);const ents=(await scan(T_ENTITLEMENTS).catch(()=>[])).filter(e=>e.purchaseId===id);const ledger=await scan(T_ENTITLEMENT_LEDGER).catch(()=>[]);const now=new Date().toISOString();if(purchaseHasEntitlementLedger(id,ents,ledger)){const r={...old,notes:body.notes!==undefined?body.notes:old.notes,updatedAt:now};assertCanEditPurchaseWithLedger(old,r,ents,ledger);await put(T_PURCHASES,id,r);return sendJson(res,{purchase:r,entitlements:[]});}const pkg=await get(T_PACKAGES,body.packageId||old.packageId).catch(()=>null);if(!pkg)return sendJson(res,{error:'售卖课包不存在'},404);const student=await get(T_STUDENTS,body.studentId||old.studentId).catch(()=>null);if(!student)return sendJson(res,{error:'学员不存在'},404);const r=buildPurchaseRecord(pkg,{...old,...body,id,createdAt:old.createdAt},student,{id,now,operator:old.operator||user.name});await put(T_PURCHASES,id,r);const synced=[];try{for(const ent of ents){const next=syncEntitlementFromPurchase(pkg,r,student,ent,now);await put(T_ENTITLEMENTS,ent.id,next);synced.push(next);}return sendJson(res,{purchase:r,entitlements:synced});}catch(err){await put(T_PURCHASES,id,old).catch(()=>null);for(const ent of ents)await put(T_ENTITLEMENTS,ent.id,ent).catch(()=>null);throw err;}}if(method==='DELETE'){const [ents,ledger]=await Promise.all([scan(T_ENTITLEMENTS).catch(()=>[]),scan(T_ENTITLEMENT_LEDGER).catch(()=>[])]);assertCanVoidPurchase(id,ents,ledger);const now=new Date().toISOString();for(const ent of ents.filter(e=>e.purchaseId===id)){await put(T_ENTITLEMENTS,ent.id,{...ent,status:'voided',updatedAt:now});const event={id:uuidv4(),entitlementId:ent.id,studentId:ent.studentId||'',purchaseId:id,lessonDelta:0,action:'void_purchase',reason:body.reason||'购买记录作废',operator:user.name||'',createdAt:now};await put(T_ENTITLEMENT_LEDGER,event.id,event);}const old=await get(T_PURCHASES,id).catch(()=>null);if(old)await put(T_PURCHASES,id,{...old,status:'voided',voidedAt:now,voidedBy:user.name||'',voidReason:body.reason||'购买记录作废',updatedAt:now});return sendJson(res,{success:true});}}
    if(path==='/membership-plans'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      if(method==='GET')return sendJson(res,await scan(T_MEMBERSHIP_PLANS).catch(()=>[]));
      if(method==='POST'){const now=new Date().toISOString();const r=buildMembershipPlanRecord(body,{id:uuidv4(),now});await put(T_MEMBERSHIP_PLANS,r.id,r);return sendJson(res,r);}
    }
    const mpM=path.match(/^\/membership-plans\/(.+)$/);if(mpM){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      const id=mpM[1];
      if(method==='GET')return sendJson(res,await get(T_MEMBERSHIP_PLANS,id));
      if(method==='PUT'){const old=await get(T_MEMBERSHIP_PLANS,id).catch(()=>null);if(!old)return sendJson(res,{error:'会员方案不存在'},404);const r=buildMembershipPlanRecord({...old,...body,id,createdAt:old.createdAt},{id,now:new Date().toISOString()});await put(T_MEMBERSHIP_PLANS,id,r);return sendJson(res,r);}
      if(method==='DELETE'){const orders=await scan(T_MEMBERSHIP_ORDERS).catch(()=>[]);if(orders.some(o=>o.membershipPlanId===id))return sendJson(res,{error:'该会员方案已有购买记录，不能删除，请停用'},400);await del(T_MEMBERSHIP_PLANS,id);return sendJson(res,{success:true});}
    }
    if(path==='/membership-accounts/reconcile'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      return sendJson(res,await runMembershipReconcile());
    }
    if(path==='/membership-accounts'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      if(method==='GET'){const rows=await scan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]);const courtId=query.get('courtId')||'';return sendJson(res,courtId?rows.filter(a=>a.courtId===courtId):rows);}
    }
    const maM=path.match(/^\/membership-accounts\/(.+)$/);if(maM){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      const id=maM[1];
      if(method==='GET')return sendJson(res,await get(T_MEMBERSHIP_ACCOUNTS,id));
      if(method==='PUT'){const old=await get(T_MEMBERSHIP_ACCOUNTS,id).catch(()=>null);if(!old)return sendJson(res,{error:'会员账户不存在'},404);const r={...old,...body,id,updatedAt:new Date().toISOString()};await put(T_MEMBERSHIP_ACCOUNTS,id,r);return sendJson(res,r);}
    }
    if(path==='/membership-orders'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      if(method==='GET')return sendJson(res,await scan(T_MEMBERSHIP_ORDERS).catch(()=>[]));
      if(method==='POST'){
        await runMembershipReconcile();
        const court=await get(T_COURTS,body.courtId).catch(()=>null);
        if(!court)return sendJson(res,{error:'订场用户不存在'},404);
        const plan=await get(T_MEMBERSHIP_PLANS,body.membershipPlanId).catch(()=>null);
        if(!plan)return sendJson(res,{error:'会员方案不存在'},404);
        if(plan.status&&plan.status!=='active')return sendJson(res,{error:'该会员方案已停用'},400);
        const existingOrders=await scan(T_MEMBERSHIP_ORDERS).catch(()=>[]);
        const existingAccount=(await scan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[])).find(a=>a.courtId===court.id&&a.status!=='voided');
        const now=new Date().toISOString();
        const purchaseDate=body.purchaseDate||now.slice(0,10);
        const rechargeAmount=normalizeMoney(body.rechargeAmount??plan.rechargeAmount);
        if(isDuplicateMembershipOrderSubmission({courtId:court.id,membershipPlanId:plan.id,purchaseDate,rechargeAmount,requestKey:body.requestKey,recentOrders:existingOrders,now}))return sendJson(res,{error:'检测到重复提交，请勿重复开卡/续充'},409);
        const built=buildMembershipPurchase({court,plan,existingAccount,body:{...body,purchaseDate,rechargeAmount,operator:body.operator||user.name},now});
        const originalCourt={...court};
        try{
          const history=[...normalizeCourtHistory(court.history),built.historyRow];
          const nextCourt=normalizeCourtRecord({...court,history,updatedAt:now});
          await put(T_MEMBERSHIP_ACCOUNTS,built.account.id,built.account);
          await put(T_MEMBERSHIP_ORDERS,built.order.id,built.order);
          await put(T_COURTS,court.id,nextCourt);
          return sendJson(res,built);
        }catch(err){
          await put(T_COURTS,originalCourt.id,originalCourt).catch(()=>null);
          await del(T_MEMBERSHIP_ORDERS,built.order.id).catch(()=>null);
          if(!existingAccount)await del(T_MEMBERSHIP_ACCOUNTS,built.account.id).catch(()=>null);
          else await put(T_MEMBERSHIP_ACCOUNTS,existingAccount.id,existingAccount).catch(()=>null);
          throw err;
        }
      }
    }
    const moM=path.match(/^\/membership-orders\/(.+)$/);if(moM){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      const id=moM[1];
      if(method==='GET')return sendJson(res,await get(T_MEMBERSHIP_ORDERS,id));
      if(method==='PUT'){const old=await get(T_MEMBERSHIP_ORDERS,id).catch(()=>null);if(!old)return sendJson(res,{error:'会员购买记录不存在'},404);const r={...old,...body,id,updatedAt:new Date().toISOString()};await put(T_MEMBERSHIP_ORDERS,id,r);return sendJson(res,r);}
      if(method==='DELETE'){const old=await get(T_MEMBERSHIP_ORDERS,id).catch(()=>null);if(old)await put(T_MEMBERSHIP_ORDERS,id,{...old,status:'voided',voidedAt:new Date().toISOString(),voidedBy:user.name||'',voidReason:body.reason||'会员购买记录作废',updatedAt:new Date().toISOString()});return sendJson(res,{success:true});}
    }
    if(path==='/membership-benefit-ledger'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      if(method==='GET')return sendJson(res,await scan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[]));
      if(method==='POST'){
        const now=new Date().toISOString();
        if(!body.membershipOrderId&&(body.action==='consume'||parseInt(body.delta)<0)){
          const [orders,ledger]=await Promise.all([scan(T_MEMBERSHIP_ORDERS).catch(()=>[]),scan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[])]);
          const rows=allocateMembershipBenefitUsage({
            membershipAccountId:body.membershipAccountId,
            courtId:body.courtId,
            benefitCode:body.benefitCode,
            benefitLabel:body.benefitLabel,
            unit:body.unit,
            consumeCount:Math.abs(parseInt(body.delta)||0)||Math.abs(parseInt(body.consumeCount)||0),
            orders,
            ledger,
            relatedDate:body.relatedDate,
            reason:body.reason||'会员权益使用',
            operator:body.operator||user.name,
            now,
            idFactory:uuidv4
          });
          for(const row of rows)await put(T_MEMBERSHIP_BENEFIT_LEDGER,row.id,row);
          return sendJson(res,{records:rows});
        }
        const r=buildMembershipBenefitLedgerRecord({...body,operator:body.operator||user.name},{id:uuidv4(),now});
        await put(T_MEMBERSHIP_BENEFIT_LEDGER,r.id,r);
        return sendJson(res,r);
      }
    }
    if(path==='/membership-account-events'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      if(method==='GET')return sendJson(res,await scan(T_MEMBERSHIP_ACCOUNT_EVENTS).catch(()=>[]));
    }
    if(path==='/entitlements'){await init();if(method==='GET'){const rows=await scan(T_ENTITLEMENTS).catch(()=>[]);const sid=query.get('studentId')||'';return sendJson(res,sid?rows.filter(e=>e.studentId===sid):rows);}}
    if(path==='/entitlements/recommend'&&method==='POST'){await init();const rows=(await scan(T_ENTITLEMENTS).catch(()=>[])).filter(e=>parseArr(body.studentIds).includes(e.studentId));return sendJson(res,recommendEntitlements(rows,body));}
    const entM=path.match(/^\/entitlements\/(.+)$/);if(entM){const id=entM[1];if(method==='GET')return sendJson(res,await get(T_ENTITLEMENTS,id));if(method==='DELETE'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);assertCanDeleteEntitlement(id,await scan(T_ENTITLEMENT_LEDGER).catch(()=>[]),await scan(T_ENTITLEMENTS).catch(()=>[]));await del(T_ENTITLEMENTS,id);return sendJson(res,{success:true});}}
    if(path==='/plans'){await init();if(method==='GET')return sendJson(res,await scan(T_PLANS));if(method==='POST'){const id=uuidv4();const r={...body,id,history:body.history||[],usedLessons:body.usedLessons||0,status:body.status||'active',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put(T_PLANS,id,r);return sendJson(res,r);}}
    const plM=path.match(/^\/plans\/(.+)$/);if(plM){const id=plM[1];if(method==='GET')return sendJson(res,await get(T_PLANS,id));if(method==='PUT'){const r={...body,id,updatedAt:new Date().toISOString()};await put(T_PLANS,id,r);return sendJson(res,r);}if(method==='DELETE'){await del(T_PLANS,id);return sendJson(res,{success:true});}}
    if(path==='/feedbacks'){
      await init();
      if(method==='GET')return sendJson(res,await withTimeout(scanFeedbacks().catch(()=>[]),3000,[]));
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
      if(method==='GET')return sendJson(res,await scan(T_SCHEDULE));
      if(method==='POST'){
        const id=uuidv4();
        const r={...body,venue:normalizeVenue(body.venue),id,status:body.status||'已排课',createdBy:user.name,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
        const risk=await validateScheduleSave(r,null);
        assertScheduleEntitlementRequired(r);
        await assertScheduleEntitlementCapacity(r,null);
        await put(T_SCHEDULE,id,r);
        const nextDelta=scheduleLessonDelta(r);
        const nextEntDelta=scheduleEntitlementDelta(r);
        const appliedEntitlements=[];
        let lessonApplied=false;
        try{
          const entitlementUpdate=nextEntDelta?await applyEntitlementDelta(nextEntDelta.entitlementId,id,-nextEntDelta.delta,'consume','排课消课',user):null;
          if(nextEntDelta)appliedEntitlements.push({entitlementId:nextEntDelta.entitlementId,delta:nextEntDelta.delta,action:'rollback',reason:'排课保存失败退回'});
          const lessonUpdate=nextDelta?await applyLessonDelta(nextDelta.classId,nextDelta.delta):null;
          if(nextDelta)lessonApplied=true;
          return sendJson(res,{schedule:r,warnings:risk.warnings||[],...(lessonUpdate||{}),...(entitlementUpdate||{})});
        }catch(err){
          await del(T_SCHEDULE,id).catch(()=>null);
          for(const item of appliedEntitlements)await applyEntitlementDelta(item.entitlementId,id,item.delta,item.action,item.reason,user).catch(()=>null);
          if(nextDelta&&lessonApplied)await applyLessonDelta(nextDelta.classId,-nextDelta.delta).catch(()=>null);
          throw err;
        }
      }
    }
    const schM=path.match(/^\/schedule\/(.+)$/);
    if(schM){
      const id=schM[1];
      if(method==='GET')return sendJson(res,await get(T_SCHEDULE,id));
      if(method==='PUT'){
        const ex=await get(T_SCHEDULE,id).catch(()=>null);
        const r={...ex,...body,venue:normalizeVenue(body.venue??ex?.venue),id,updatedAt:new Date().toISOString()};
        const oldDelta=scheduleLessonDelta(ex);
        const nextDelta=scheduleLessonDelta(r);
        const risk=await validateScheduleSave(r,ex);
        assertScheduleEntitlementRequired(r);
        await assertScheduleEntitlementCapacity(r,ex);
        assertScheduleEditableAfterFeedback(ex,r,await scanFeedbacks().catch(()=>[]));
        await put(T_SCHEDULE,id,r);
        const appliedEntitlements=[];
        const appliedClassDeltas=[];
        try{
          const changed=[];
          const entitlementChanged=[];
          const oldEntDelta=scheduleEntitlementDelta(ex);
          const nextEntDelta=scheduleEntitlementDelta(r);
          if(oldEntDelta){entitlementChanged.push(await applyEntitlementDelta(oldEntDelta.entitlementId,id,oldEntDelta.delta,'return','编辑排课退回旧权益',user));appliedEntitlements.push({entitlementId:oldEntDelta.entitlementId,delta:-oldEntDelta.delta,action:'rollback',reason:'编辑排课失败重新扣旧权益'});}
          if(nextEntDelta){entitlementChanged.push(await applyEntitlementDelta(nextEntDelta.entitlementId,id,-nextEntDelta.delta,'consume','编辑排课消课',user));appliedEntitlements.push({entitlementId:nextEntDelta.entitlementId,delta:nextEntDelta.delta,action:'rollback',reason:'编辑排课失败退回新权益'});}
          if(oldDelta){changed.push(await applyLessonDelta(oldDelta.classId,-oldDelta.delta));appliedClassDeltas.push({classId:oldDelta.classId,delta:oldDelta.delta});}
          if(nextDelta){changed.push(await applyLessonDelta(nextDelta.classId,nextDelta.delta));appliedClassDeltas.push({classId:nextDelta.classId,delta:-nextDelta.delta});}
          const classes=changed.filter(Boolean).map(x=>x.class);
          const plans=changed.filter(Boolean).flatMap(x=>x.plans||[]);
          const entitlements=entitlementChanged.filter(Boolean).map(x=>x.entitlement);
          const entitlementLedger=entitlementChanged.filter(Boolean).map(x=>x.ledger);
          return sendJson(res,{schedule:r,classes,plans,entitlements,entitlementLedger,warnings:risk.warnings||[]});
        }catch(err){
          await put(T_SCHEDULE,id,ex).catch(()=>null);
          for(const item of appliedClassDeltas)await applyLessonDelta(item.classId,item.delta).catch(()=>null);
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
    if(path==='/coaches'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);await init();if(method==='GET')return sendJson(res,await scan(T_COACHES));if(method==='POST'){const id=uuidv4();const name=String(body.name||'').trim();if(!name)return sendJson(res,{error:'请填写教练姓名'},400);assertUniqueCoachName(name,await scan(T_COACHES));const r={...body,name,phone:assertPhone(body.phone),id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put(T_COACHES,id,r);return sendJson(res,r);}}
    const coM=path.match(/^\/coaches\/(.+)$/);if(coM){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);const id=coM[1];if(method==='PUT'){const old=await get(T_COACHES,id).catch(()=>null);if(!old)return sendJson(res,{error:'教练不存在'},404);const name=String(body.name||'').trim();if(!name)return sendJson(res,{error:'请填写教练姓名'},400);assertUniqueCoachName(name,await scan(T_COACHES),id);const r={...body,name,phone:assertPhone(body.phone),id,updatedAt:new Date().toISOString()};await put(T_COACHES,id,r);const coachUpdates=await applyCoachRename(old.name,name);return sendJson(res,{...r,coachUpdates});}if(method==='DELETE'){const old=await get(T_COACHES,id).catch(()=>null);if(!old)return sendJson(res,{success:true});assertCanDeleteCoachName(old.name,await loadCoachReferenceData(),old.id);await del(T_COACHES,id);return sendJson(res,{success:true});}}
    if(path==='/classes'){await init();if(method==='GET')return sendJson(res,await scan(T_CLASSES));if(method==='POST'){const id=uuidv4();const r={...body,id,usedLessons:body.usedLessons||0,status:body.status||'已排班',createdBy:user.name,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put(T_CLASSES,id,r);const syncedPlans=await syncClassPlans(id,r);return sendJson(res,{class:r,plans:syncedPlans});}}
    const clM=path.match(/^\/classes\/(.+)$/);if(clM){const id=clM[1];if(method==='GET')return sendJson(res,await get(T_CLASSES,id));if(method==='PUT'){const old=await get(T_CLASSES,id).catch(()=>null);const r={...body,id,updatedAt:new Date().toISOString()};assertCanEditClassWithSchedules(old,r,await scan(T_SCHEDULE));await put(T_CLASSES,id,r);const syncedPlans=await syncClassPlans(id,r);return sendJson(res,{class:r,plans:syncedPlans});}if(method==='DELETE'){assertCanDeleteClass(id,await scan(T_SCHEDULE));const classPlans=(await scan(T_PLANS)).filter(p=>p.classId===id);for(const p of classPlans)await del(T_PLANS,p.id);await del(T_CLASSES,id);return sendJson(res,{success:true});}}
    if(path==='/campuses'){await init();if(method==='GET')return sendJson(res,await scan(T_CAMPUSES));if(method==='POST'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);const id=body.code||uuidv4();const r={...body,id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put(T_CAMPUSES,id,r);return sendJson(res,r);}}
    const caM=path.match(/^\/campuses\/(.+)$/);if(caM){const id=caM[1];if(method==='PUT'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);const r={...body,id,updatedAt:new Date().toISOString()};await put(T_CAMPUSES,id,r);return sendJson(res,r);}if(method==='DELETE'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);const [students,coaches,classes,schedule,courts,packages,entitlements]=await Promise.all([scan(T_STUDENTS).catch(()=>[]),scan(T_COACHES).catch(()=>[]),scan(T_CLASSES).catch(()=>[]),scan(T_SCHEDULE).catch(()=>[]),scan(T_COURTS).catch(()=>[]),scan(T_PACKAGES).catch(()=>[]),scan(T_ENTITLEMENTS).catch(()=>[])]);assertCanDeleteCampus(id,{students,coaches,classes,schedule,courts,packages,entitlements});await del(T_CAMPUSES,id);return sendJson(res,{success:true});}}
    return sendJson(res,{error:'Not found'},404);
  }catch(e){console.error('API error:',e);return sendJson(res,{error:e.message},500);}
};

module.exports._test={
  MEMBERSHIP_TABLES,
  scheduleLessonDelta,
  assertLessonCapacity,
  validateScheduleConflicts,
  validateCourtBookingConflicts,
  buildEntitlementFromPurchase,
  buildPurchaseRecord,
  validatePackageInput,
  normalizePackageRecord,
  assertCanEditProductWithReferences,
  assertCanEditPackageWithPurchases,
  assertCanEditPurchaseWithLedger,
  assertScheduleEntitlementRequired,
  syncEntitlementFromPurchase,
  writePurchaseAndEntitlementAtomic,
  validateEntitlementForSchedule,
  recommendEntitlements,
  applyEntitlementLessonDelta,
  assertScheduleEditableAfterFeedback,
  isScheduleInsideDailyTimeWindows,
  scheduleEntitlementDelta,
  collectScheduleRiskWarnings,
  buildFeedbackRecord,
  assertCanWriteFeedback,
  filterLoadAllForUser,
  buildCoachRenameUpdates,
  buildStudentIdentityUpdates,
  assertCanDeleteCoachName,
  assertUniqueCoachName,
  mergeStoredAuthUser,
  normalizeVenue,
  rangesOverlap,
  computeCourtFinance,
  normalizeMembershipBenefitTemplate,
  buildMembershipPlanRecord,
  buildMembershipPurchase,
  summarizeMembershipBenefits,
  isDuplicateMembershipOrderSubmission,
  buildMembershipBenefitLedgerRecord,
  allocateMembershipBenefitUsage,
  reconcileMembershipAccounts,
  normalizeCourtRecord,
  buildLegacyCourtOpeningHistory,
  legacyCourtFinanceWarnings,
  extractDepositAmountFromText,
  importCourtRows,
  buildClassPlanRecord,
  assertCanDeleteProduct,
  assertCanDeleteClass,
  assertCanDeletePackage,
  assertCanVoidPurchase,
  assertCanDeleteEntitlement,
  assertCanEditClassWithSchedules,
  assertCanDeleteSchedule,
  assertCanDeleteStudent,
  assertCanDeleteCourt,
  assertCanDeleteCampus,
  deleteCourtsByIds,
  getRuntimeEnsuredTables
};
