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

const T_USERS='ft_users',T_COURTS='ft_courts',T_STUDENTS='ft_students',T_PRODUCTS='ft_products',T_PLANS='ft_plans',T_SCHEDULE='ft_schedule',T_COACHES='ft_coaches',T_CLASSES='ft_classes',T_CAMPUSES='ft_campuses',T_FEEDBACKS='ft_feedbacks';

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
  return {
    courts:[],
    students:normalized.students.filter(s=>studentIds.has(s.id)),
    products:normalized.products,
    plans:ownPlans,
    schedule:ownSchedule,
    coaches:normalized.coaches.filter(c=>String(c.name||'').trim()===coachName),
    classes:ownClasses,
    campuses:normalized.campuses,
    feedbacks:normalized.feedbacks.filter(f=>scheduleIds.has(f.scheduleId))
  };
}
async function validateScheduleSave(nextRec,oldRec){
  const schedules=await timed('scan schedule for conflict check',()=>scan(T_SCHEDULE));
  validateScheduleConflicts(nextRec,schedules,nextRec.id);
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
  if(ENABLE_TABLE_BOOTSTRAP){
    for(const t of[T_USERS,T_COURTS,T_STUDENTS,T_PRODUCTS,T_PLANS,T_SCHEDULE,T_COACHES,T_CLASSES,T_CAMPUSES,T_FEEDBACKS])await mkTable(t);
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
function assertCanDeleteProduct(productId,classes){
  if((classes||[]).some(c=>c.productId===productId))throw new Error('该课程产品已有班次使用，不能删除');
}
function assertCanDeleteClass(classId,schedules){
  if((schedules||[]).some(s=>s.classId===classId))throw new Error('该班次已有排课，不能删除');
}
function assertCanDeleteCourt(court){
  if(parseArr(court?.history).length)throw new Error('该客户已有财务流水，不能直接删除');
  if(normalizeMoney(court?.balance)||normalizeMoney(court?.totalDeposit)||normalizeMoney(court?.spentAmount))throw new Error('该客户已有财务数据，不能直接删除');
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
  const method=req.method;
  const startedAt=Date.now();
  if(res&&typeof res.on==='function')res.on('finish',()=>{console.log(`[api] ${method} ${path} ${res.statusCode} ${Date.now()-startedAt}ms`);});
  const body=req.body||{};
  try{
    if(path==='/health')return sendJson(res,{status:'ok',time:new Date().toISOString()});
    if(path==='/auth/login'&&method==='POST'){await init();const{username,password}=body;if(!username||!password)return sendJson(res,{error:'请填写账号和密码'},400);const user=await get(T_USERS,username);if(!user||!await bcrypt.compare(password,user.password))return sendJson(res,{error:'账号或密码错误'},401);const coachName=user.coachName||(user.role==='editor'?user.name:'');const payload={id:user.id,name:user.name,role:user.role,coachId:user.coachId||'',coachName};const token=jwt.sign(payload,JWT_SECRET,{expiresIn:'7d'});return sendJson(res,{token,user:payload});}
    const user=authUser(req);if(!user)return sendJson(res,{error:'未登录'},401);
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
      const [courts,students,products,plans,schedule,coaches,classes,campuses,feedbacks]=await Promise.all([
        timed('load-all scan courts',()=>scan(T_COURTS)),
        timed('load-all scan students',()=>scan(T_STUDENTS)),
        timed('load-all scan products',()=>scan(T_PRODUCTS)),
        timed('load-all scan plans',()=>scan(T_PLANS)),
        timed('load-all scan schedule',()=>scan(T_SCHEDULE)),
        timed('load-all scan coaches',()=>scan(T_COACHES).catch(()=>[])),
        timed('load-all scan classes',()=>scan(T_CLASSES).catch(()=>[])),
        timed('load-all scan campuses',()=>scan(T_CAMPUSES).catch(()=>[])),
        timed('load-all scan feedbacks',()=>withTimeout(scanFeedbacks().catch(()=>[]),3000,[]))
      ]);
      return sendJson(res,filterLoadAllForUser({
        courts:Array.isArray(courts)?courts:[],
        students:Array.isArray(students)?students:[],
        products:Array.isArray(products)?products:[],
        plans:Array.isArray(plans)?plans:[],
        schedule:Array.isArray(schedule)?schedule:[],
        coaches:Array.isArray(coaches)?coaches:[],
        classes:Array.isArray(classes)?classes:[],
        campuses:Array.isArray(campuses)?campuses:[],
        feedbacks:Array.isArray(feedbacks)?feedbacks:[]
      },user));
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
    const sM=path.match(/^\/students\/(.+)$/);if(sM){const id=sM[1];if(method==='PUT'){const r={...body,phone:assertPhone(body.phone),id,updatedAt:new Date().toISOString()};await put(T_STUDENTS,id,r);return sendJson(res,r);}if(method==='DELETE'){await del(T_STUDENTS,id);return sendJson(res,{success:true});}}
    if(path==='/init-data'&&method==='POST'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);await init();const ss=body.students||[];for(const s of ss)await put(T_STUDENTS,s.id||uuidv4(),{...s,updatedAt:new Date().toISOString()});return sendJson(res,{success:true,count:ss.length});}
    if(path==='/products'){await init();if(method==='GET')return sendJson(res,await scan(T_PRODUCTS));if(method==='POST'){const id=uuidv4();const r={...body,id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put(T_PRODUCTS,id,r);return sendJson(res,r);}}
    const pM=path.match(/^\/products\/(.+)$/);if(pM){const id=pM[1];if(method==='GET')return sendJson(res,await get(T_PRODUCTS,id));if(method==='PUT'){const r={...body,id,updatedAt:new Date().toISOString()};await put(T_PRODUCTS,id,r);return sendJson(res,r);}if(method==='DELETE'){assertCanDeleteProduct(id,await scan(T_CLASSES));await del(T_PRODUCTS,id);return sendJson(res,{success:true});}}
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
        await put(T_SCHEDULE,id,r);
        const nextDelta=scheduleLessonDelta(r);
        const lessonUpdate=nextDelta?await applyLessonDelta(nextDelta.classId,nextDelta.delta):null;
        return sendJson(res,{schedule:r,warnings:risk.warnings||[],...(lessonUpdate||{})});
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
        await put(T_SCHEDULE,id,r);
        try{
          const changed=[];
          if(oldDelta)changed.push(await applyLessonDelta(oldDelta.classId,-oldDelta.delta));
          if(nextDelta)changed.push(await applyLessonDelta(nextDelta.classId,nextDelta.delta));
          const classes=changed.filter(Boolean).map(x=>x.class);
          const plans=changed.filter(Boolean).flatMap(x=>x.plans||[]);
          return sendJson(res,{schedule:r,classes,plans,warnings:risk.warnings||[]});
        }catch(err){
          await put(T_SCHEDULE,id,ex).catch(()=>null);
          if(oldDelta)await applyLessonDelta(oldDelta.classId,oldDelta.delta).catch(()=>null);
          if(nextDelta)await applyLessonDelta(nextDelta.classId,-nextDelta.delta).catch(()=>null);
          throw err;
        }
      }
      if(method==='DELETE'){
        const ex=await get(T_SCHEDULE,id).catch(()=>null);
        const oldDelta=scheduleLessonDelta(ex);
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
    if(path==='/coaches'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);await init();if(method==='GET')return sendJson(res,await scan(T_COACHES));if(method==='POST'){const id=uuidv4();const r={...body,phone:assertPhone(body.phone),id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put(T_COACHES,id,r);return sendJson(res,r);}}
    const coM=path.match(/^\/coaches\/(.+)$/);if(coM){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);const id=coM[1];if(method==='PUT'){const r={...body,phone:assertPhone(body.phone),id,updatedAt:new Date().toISOString()};await put(T_COACHES,id,r);return sendJson(res,r);}if(method==='DELETE'){await del(T_COACHES,id);return sendJson(res,{success:true});}}
    if(path==='/classes'){await init();if(method==='GET')return sendJson(res,await scan(T_CLASSES));if(method==='POST'){const id=uuidv4();const r={...body,id,usedLessons:body.usedLessons||0,status:body.status||'已排班',createdBy:user.name,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put(T_CLASSES,id,r);const syncedPlans=await syncClassPlans(id,r);return sendJson(res,{class:r,plans:syncedPlans});}}
    const clM=path.match(/^\/classes\/(.+)$/);if(clM){const id=clM[1];if(method==='GET')return sendJson(res,await get(T_CLASSES,id));if(method==='PUT'){const r={...body,id,updatedAt:new Date().toISOString()};await put(T_CLASSES,id,r);const syncedPlans=await syncClassPlans(id,r);return sendJson(res,{class:r,plans:syncedPlans});}if(method==='DELETE'){assertCanDeleteClass(id,await scan(T_SCHEDULE));const classPlans=(await scan(T_PLANS)).filter(p=>p.classId===id);for(const p of classPlans)await del(T_PLANS,p.id);await del(T_CLASSES,id);return sendJson(res,{success:true});}}
    if(path==='/campuses'){await init();if(method==='GET')return sendJson(res,await scan(T_CAMPUSES));if(method==='POST'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);const id=body.code||uuidv4();const r={...body,id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put(T_CAMPUSES,id,r);return sendJson(res,r);}}
    const caM=path.match(/^\/campuses\/(.+)$/);if(caM){const id=caM[1];if(method==='PUT'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);const r={...body,id,updatedAt:new Date().toISOString()};await put(T_CAMPUSES,id,r);return sendJson(res,r);}if(method==='DELETE'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);await del(T_CAMPUSES,id);return sendJson(res,{success:true});}}
    return sendJson(res,{error:'Not found'},404);
  }catch(e){console.error('API error:',e);return sendJson(res,{error:e.message},500);}
};

module.exports._test={
  scheduleLessonDelta,
  assertLessonCapacity,
  validateScheduleConflicts,
  collectScheduleRiskWarnings,
  buildFeedbackRecord,
  assertCanWriteFeedback,
  filterLoadAllForUser,
  normalizeVenue,
  rangesOverlap,
  computeCourtFinance,
  normalizeCourtRecord,
  buildLegacyCourtOpeningHistory,
  legacyCourtFinanceWarnings,
  extractDepositAmountFromText,
  importCourtRows,
  buildClassPlanRecord,
  assertCanDeleteProduct,
  assertCanDeleteClass,
  assertCanDeleteCourt,
  deleteCourtsByIds
};
