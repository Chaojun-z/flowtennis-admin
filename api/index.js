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

const T_USERS='ft_users',T_COURTS='ft_courts',T_STUDENTS='ft_students',T_PRODUCTS='ft_products',T_PLANS='ft_plans',T_SCHEDULE='ft_schedule',T_COACHES='ft_coaches',T_CLASSES='ft_classes',T_CAMPUSES='ft_campuses';

let tsClient;
function gc(){if(!tsClient)tsClient=new TableStore.Client({accessKeyId:TS_KEY_ID,secretAccessKey:TS_KEY_SEC,endpoint:TS_ENDPOINT,instancename:TS_INSTANCE,maxRetries:3});return tsClient;}

function put(t,id,attrs){return new Promise((res,rej)=>{gc().putRow({tableName:t,condition:new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE,null),primaryKey:[{id:String(id)}],attributeColumns:Object.entries(attrs).filter(([k])=>k!=='id').map(([k,v])=>({[k]:typeof v==='object'?JSON.stringify(v):String(v??'')}))},( e,d)=>e?rej(e):res(d));});}
function get(t,id){return new Promise((res,rej)=>{gc().getRow({tableName:t,primaryKey:[{id:String(id)}],maxVersions:1},(e,d)=>{if(e)return rej(e);if(!d.row||!d.row.primaryKey)return res(null);const obj={id:d.row.primaryKey[0].value};(d.row.attributes||[]).forEach(a=>{try{obj[a.columnName]=JSON.parse(a.columnValue);}catch{obj[a.columnName]=a.columnValue;}});res(obj);});});}
function scan(t){return new Promise((res,rej)=>{const rows=[];function f(sk){gc().getRange({tableName:t,direction:TableStore.Direction.FORWARD,inclusiveStartPrimaryKey:sk||[{id:TableStore.INF_MIN}],exclusiveEndPrimaryKey:[{id:TableStore.INF_MAX}],maxVersions:1,limit:500},(e,d)=>{if(e)return rej(e);(d.rows||[]).forEach(r=>{if(!r.primaryKey)return;const obj={id:r.primaryKey[0].value};(r.attributes||[]).forEach(a=>{try{obj[a.columnName]=JSON.parse(a.columnValue);}catch{obj[a.columnName]=a.columnValue;}});rows.push(obj);});d.nextStartPrimaryKey?f(d.nextStartPrimaryKey):res(rows);});}f();});}
function del(t,id){return new Promise((res,rej)=>{gc().deleteRow({tableName:t,condition:new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE,null),primaryKey:[{id:String(id)}]},(e,d)=>e?rej(e):res(d));});}
function mkTable(t){return new Promise(res=>{gc().createTable({tableMeta:{tableName:t,primaryKey:[{name:'id',type:TableStore.PrimaryKeyType.STRING}]},reservedThroughput:{capacityUnit:{read:0,write:0}},tableOptions:{timeToLive:-1,maxVersions:1}},e=>res(e?'exists':'ok'));});}
async function applyLessonDelta(classId,delta){
  if(!classId||!delta)return;
  const cls=await get(T_CLASSES,classId);
  if(!cls)return;
  const oldClass={...cls};
  const nextUsed=Math.max(0,(parseInt(cls.usedLessons)||0)+delta);
  const relatedPlans=(await scan(T_PLANS)).filter((p)=>p.classId===classId&&p.status==='active');
  const oldPlans=relatedPlans.map((p)=>({...p}));
  try{
    await put(T_CLASSES,classId,{...cls,usedLessons:nextUsed,updatedAt:new Date().toISOString()});
    for(const p of relatedPlans){
      const nextPlanUsed=Math.max(0,(parseInt(p.usedLessons)||0)+delta);
      await put(T_PLANS,p.id,{...p,usedLessons:nextPlanUsed,updatedAt:new Date().toISOString()});
    }
  }catch(err){
    await put(T_CLASSES,classId,oldClass).catch(()=>null);
    for(const p of oldPlans)await put(T_PLANS,p.id,p).catch(()=>null);
    throw err;
  }
}
function scheduleLessonDelta(rec){
  if(!rec||!rec.classId)return null;
  const lessonCount=parseInt(rec.lessonCount)||0;
  if(lessonCount<=0)return null;
  return {classId:rec.classId,delta:lessonCount};
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
  const missing=REQUIRED_ENV_VARS.filter((k)=>!process.env[k]);
  if(missing.length)throw new Error('缺少环境变量：'+missing.join(', '));
  for(const t of[T_USERS,T_COURTS,T_STUDENTS,T_PRODUCTS,T_PLANS,T_SCHEDULE,T_COACHES,T_CLASSES,T_CAMPUSES])await mkTable(t);
  await bootstrapDefaultUsers();
  const defaultCampuses=[{id:'mabao',name:'顺义马坡',code:'mabao'},{id:'shilipu',name:'朝阳十里堡',code:'shilipu'},{id:'guowang',name:'朝阳国网',code:'guowang'},{id:'langang',name:'朝阳蓝色港湾',code:'langang'},{id:'chaojun',name:'朝珺私教',code:'chaojun'}];
  for(const c of defaultCampuses){
    const ex=await get(T_CAMPUSES,c.id).catch(()=>null);
    if(!ex)await put(T_CAMPUSES,c.id,{...c,createdAt:new Date().toISOString()});
  }
  await ensureCoachBindings();
  inited=true;
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

module.exports = async (req, res) => {
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');return res.status(200).end();}
  const path=(req.url||'').replace(/^\/api/,'').split('?')[0];
  const method=req.method;
  const body=req.body||{};
  try{
    if(path==='/health')return sendJson(res,{status:'ok',time:new Date().toISOString()});
    if(path==='/auth/login'&&method==='POST'){await init();const{username,password}=body;if(!username||!password)return sendJson(res,{error:'请填写账号和密码'},400);const user=await get(T_USERS,username);if(!user||!await bcrypt.compare(password,user.password))return sendJson(res,{error:'账号或密码错误'},401);const coachName=user.coachName||(user.role==='editor'?user.name:'');const payload={id:user.id,name:user.name,role:user.role,coachId:user.coachId||'',coachName};const token=jwt.sign(payload,JWT_SECRET,{expiresIn:'7d'});return sendJson(res,{token,user:payload});}
    const user=authUser(req);if(!user)return sendJson(res,{error:'未登录'},401);
    if(path==='/admin/create-user'&&method==='POST'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);await init();const{id,name,password,role,coachId,coachName}=body;if(!id||!name||!password)return sendJson(res,{error:'缺少必填字段'},400);const nextRole=role||'editor';const hashed=await bcrypt.hash(password,10);const nextCoachName=coachName||(nextRole==='editor'?name:'');await put(T_USERS,id,{id,name,password:hashed,role:nextRole,coachId:coachId||'',coachName:nextCoachName});return sendJson(res,{success:true,id,name,role:nextRole,coachId:coachId||'',coachName:nextCoachName});}
    if(path==='/admin/update-user'&&method==='POST'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);await init();const{id,coachId,coachName}=body;if(!id)return sendJson(res,{error:'缺少用户ID'},400);const u=await get(T_USERS,id);if(!u)return sendJson(res,{error:'用户不存在'},404);const updates={...u,coachId:coachId||''};if(body.name)updates.name=body.name;updates.coachName=coachName||(u.role==='editor'?(updates.name||u.name):'');await put(T_USERS,id,updates);return sendJson(res,{success:true});}
    if(path==='/admin/users'&&method==='GET'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);await init();const all=await scan(T_USERS);return sendJson(res,all.map(u=>({id:u.id,name:u.name,role:u.role,coachId:u.coachId||'',coachName:u.coachName||''})));}
    if(path==='/auth/me')return sendJson(res,user);
    if(path==='/load-all'&&method==='GET'){
      await init();
      const [courts,students,products,plans,schedule,coaches,classes,campuses]=await Promise.all([
        scan(T_COURTS),
        scan(T_STUDENTS),
        scan(T_PRODUCTS),
        scan(T_PLANS),
        scan(T_SCHEDULE),
        scan(T_COACHES).catch(()=>[]),
        scan(T_CLASSES).catch(()=>[]),
        scan(T_CAMPUSES).catch(()=>[])
      ]);
      return sendJson(res,{
        courts:Array.isArray(courts)?courts:[],
        students:Array.isArray(students)?students:[],
        products:Array.isArray(products)?products:[],
        plans:Array.isArray(plans)?plans:[],
        schedule:Array.isArray(schedule)?schedule:[],
        coaches:Array.isArray(coaches)?coaches:[],
        classes:Array.isArray(classes)?classes:[],
        campuses:Array.isArray(campuses)?campuses:[]
      });
    }
    if(path==='/auth/change-password'&&method==='POST'){const u=await get(T_USERS,user.id);if(!await bcrypt.compare(body.oldPassword,u.password))return sendJson(res,{error:'原密码错误'},400);await put(T_USERS,user.id,{...u,password:await bcrypt.hash(body.newPassword,10)});return sendJson(res,{success:true});}
    if(path==='/courts'){
      await init();
      if(method==='GET')return sendJson(res,await scan(T_COURTS));
      if(method==='POST'){
        const id=uuidv4();
        const r={...body,phone:assertPhone(body.phone),id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
        await put(T_COURTS,id,r);return sendJson(res,r);
      }
    }
    if(path==='/courts/import'&&method==='POST'){
      await init();
      const rows=Array.isArray(body.rows)?body.rows:[];
      let success=0,failed=0;
      const errors=[];
      for(const row of rows){
        try{
          const id=uuidv4();
          const record={...row,phone:assertPhone(row.phone),id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
          await put(T_COURTS,id,record);
          success++;
        }catch(e){
          failed++;
          errors.push({name:row?.name||'',error:e.message});
        }
      }
      return sendJson(res,{success,failed,errors});
    }
    const cM=path.match(/^\/courts\/(.+)$/);if(cM){const id=cM[1];if(method==='PUT'){const r={...body,phone:assertPhone(body.phone),id,updatedAt:new Date().toISOString()};await put(T_COURTS,id,r);return sendJson(res,r);}if(method==='DELETE'){await del(T_COURTS,id);return sendJson(res,{success:true});}}
    if(path==='/students'){await init();if(method==='GET')return sendJson(res,await scan(T_STUDENTS));if(method==='POST'){const id=uuidv4();const r={...body,phone:assertPhone(body.phone),id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put(T_STUDENTS,id,r);return sendJson(res,r);}}
    const sM=path.match(/^\/students\/(.+)$/);if(sM){const id=sM[1];if(method==='PUT'){const r={...body,phone:assertPhone(body.phone),id,updatedAt:new Date().toISOString()};await put(T_STUDENTS,id,r);return sendJson(res,r);}if(method==='DELETE'){await del(T_STUDENTS,id);return sendJson(res,{success:true});}}
    if(path==='/init-data'&&method==='POST'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);await init();const ss=body.students||[];for(const s of ss)await put(T_STUDENTS,s.id||uuidv4(),{...s,updatedAt:new Date().toISOString()});return sendJson(res,{success:true,count:ss.length});}
    if(path==='/products'){await init();if(method==='GET')return sendJson(res,await scan(T_PRODUCTS));if(method==='POST'){const id=uuidv4();const r={...body,id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put(T_PRODUCTS,id,r);return sendJson(res,r);}}
    const pM=path.match(/^\/products\/(.+)$/);if(pM){const id=pM[1];if(method==='GET')return sendJson(res,await get(T_PRODUCTS,id));if(method==='PUT'){const r={...body,id,updatedAt:new Date().toISOString()};await put(T_PRODUCTS,id,r);return sendJson(res,r);}if(method==='DELETE'){await del(T_PRODUCTS,id);return sendJson(res,{success:true});}}
    if(path==='/plans'){await init();if(method==='GET')return sendJson(res,await scan(T_PLANS));if(method==='POST'){const id=uuidv4();const r={...body,id,history:body.history||[],usedLessons:body.usedLessons||0,status:body.status||'active',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put(T_PLANS,id,r);return sendJson(res,r);}}
    const plM=path.match(/^\/plans\/(.+)$/);if(plM){const id=plM[1];if(method==='GET')return sendJson(res,await get(T_PLANS,id));if(method==='PUT'){const r={...body,id,updatedAt:new Date().toISOString()};await put(T_PLANS,id,r);return sendJson(res,r);}if(method==='DELETE'){await del(T_PLANS,id);return sendJson(res,{success:true});}}
    if(path==='/schedule'){
      await init();
      if(method==='GET')return sendJson(res,await scan(T_SCHEDULE));
      if(method==='POST'){
        const id=uuidv4();
        const r={...body,id,status:body.status||'已排课',createdBy:user.name,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
        await put(T_SCHEDULE,id,r);
        const nextDelta=scheduleLessonDelta(r);
        if(nextDelta)await applyLessonDelta(nextDelta.classId,nextDelta.delta);
        return sendJson(res,r);
      }
    }
    const schM=path.match(/^\/schedule\/(.+)$/);
    if(schM){
      const id=schM[1];
      if(method==='GET')return sendJson(res,await get(T_SCHEDULE,id));
      if(method==='PUT'){
        const ex=await get(T_SCHEDULE,id).catch(()=>null);
        const r={...ex,...body,id,updatedAt:new Date().toISOString()};
        const oldDelta=scheduleLessonDelta(ex);
        const nextDelta=scheduleLessonDelta(r);
        await put(T_SCHEDULE,id,r);
        try{
          if(oldDelta)await applyLessonDelta(oldDelta.classId,-oldDelta.delta);
          if(nextDelta)await applyLessonDelta(nextDelta.classId,nextDelta.delta);
        }catch(err){
          await put(T_SCHEDULE,id,ex).catch(()=>null);
          if(oldDelta)await applyLessonDelta(oldDelta.classId,oldDelta.delta).catch(()=>null);
          if(nextDelta)await applyLessonDelta(nextDelta.classId,-nextDelta.delta).catch(()=>null);
          throw err;
        }
        return sendJson(res,r);
      }
      if(method==='DELETE'){
        const ex=await get(T_SCHEDULE,id).catch(()=>null);
        const oldDelta=scheduleLessonDelta(ex);
        await del(T_SCHEDULE,id);
        try{
          if(oldDelta)await applyLessonDelta(oldDelta.classId,-oldDelta.delta);
        }catch(err){
          if(ex)await put(T_SCHEDULE,id,ex).catch(()=>null);
          if(oldDelta)await applyLessonDelta(oldDelta.classId,oldDelta.delta).catch(()=>null);
          throw err;
        }
        return sendJson(res,{success:true});
      }
    }
    if(path==='/coaches'){await init();if(method==='GET')return sendJson(res,await scan(T_COACHES));if(method==='POST'){const id=uuidv4();const r={...body,phone:assertPhone(body.phone),id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put(T_COACHES,id,r);return sendJson(res,r);}}
    const coM=path.match(/^\/coaches\/(.+)$/);if(coM){const id=coM[1];if(method==='PUT'){const r={...body,phone:assertPhone(body.phone),id,updatedAt:new Date().toISOString()};await put(T_COACHES,id,r);return sendJson(res,r);}if(method==='DELETE'){await del(T_COACHES,id);return sendJson(res,{success:true});}}
    if(path==='/classes'){await init();if(method==='GET')return sendJson(res,await scan(T_CLASSES));if(method==='POST'){const id=uuidv4();const r={...body,id,usedLessons:body.usedLessons||0,status:body.status||'已排班',createdBy:user.name,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put(T_CLASSES,id,r);return sendJson(res,r);}}
    const clM=path.match(/^\/classes\/(.+)$/);if(clM){const id=clM[1];if(method==='GET')return sendJson(res,await get(T_CLASSES,id));if(method==='PUT'){const r={...body,id,updatedAt:new Date().toISOString()};await put(T_CLASSES,id,r);return sendJson(res,r);}if(method==='DELETE'){await del(T_CLASSES,id);return sendJson(res,{success:true});}}
    if(path==='/campuses'){await init();if(method==='GET')return sendJson(res,await scan(T_CAMPUSES));if(method==='POST'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);const id=body.code||uuidv4();const r={...body,id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put(T_CAMPUSES,id,r);return sendJson(res,r);}}
    const caM=path.match(/^\/campuses\/(.+)$/);if(caM){const id=caM[1];if(method==='PUT'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);const r={...body,id,updatedAt:new Date().toISOString()};await put(T_CAMPUSES,id,r);return sendJson(res,r);}if(method==='DELETE'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);await del(T_CAMPUSES,id);return sendJson(res,{success:true});}}
    return sendJson(res,{error:'Not found'},404);
  }catch(e){console.error('API error:',e);return sendJson(res,{error:e.message},500);}
};
