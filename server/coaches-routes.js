function createCoachRuleHelpers(deps={}){
  const {parseArr,sameCoachName}=deps;

  function assertUniqueCoachName(name,coaches,excludeId){
    const coach=String(name||'').trim();
    if(!coach)return;
    if((coaches||[]).some(c=>c.id!==excludeId&&sameCoachName(c.name,coach)))throw new Error('教练姓名已存在');
  }

  function buildCoachRenameUpdates(oldName,newName,data,now=new Date().toISOString(),ids={}){
    const oldCoach=String(oldName||'').trim();
    const nextCoach=String(newName||'').trim();
    const oldCoachId=String(ids.oldCoachId||ids.coachId||'').trim();
    const nextCoachId=String(ids.newCoachId||ids.coachId||oldCoachId||'').trim();
    const empty={classes:[],schedule:[],plans:[],users:[],feedbacks:[],leads:[],students:[],packages:[],purchases:[],entitlements:[]};
    if(!oldCoach||!nextCoach)return empty;
    const touch=row=>({...row,updatedAt:now});
    const nameHit=value=>sameCoachName(value,oldCoach);
    const idHit=value=>{
      const raw=String(value||'').trim();
      return !!raw&&(raw===oldCoachId||sameCoachName(raw,oldCoach));
    };
    const replaceName=value=>nameHit(value)?nextCoach:value;
    const replaceCoachId=value=>idHit(value)?(nextCoachId||nextCoach):value;
    const replaceNameList=value=>parseArr(value).map(replaceName);
    const replaceCoachIdList=value=>parseArr(value).map(replaceCoachId);
    const updateRows=(rows,mapper)=>(rows||[]).map(row=>{
      const next=mapper(row);
      return JSON.stringify(row)===JSON.stringify(next)?null:touch(next);
    }).filter(Boolean);
    const rewriteBasicCoachRef=row=>{
      const next={...row,coach:replaceName(row.coach)};
      if(Object.prototype.hasOwnProperty.call(row,'coachId'))next.coachId=replaceCoachId(row.coachId);
      return next;
    };
    const rewriteOwnerCoachRef=row=>{
      const next={...row,ownerCoach:replaceName(row.ownerCoach)};
      if(Object.prototype.hasOwnProperty.call(row,'coachNames'))next.coachNames=replaceNameList(row.coachNames);
      if(Object.prototype.hasOwnProperty.call(row,'allowedCoaches'))next.allowedCoaches=replaceNameList(row.allowedCoaches);
      if(Object.prototype.hasOwnProperty.call(row,'coachIds'))next.coachIds=replaceCoachIdList(row.coachIds);
      return next;
    };
    return {
      classes:updateRows(data.classes,rewriteBasicCoachRef),
      schedule:updateRows(data.schedule,rewriteBasicCoachRef),
      plans:updateRows(data.plans,rewriteBasicCoachRef),
      users:updateRows(data.users,row=>{
        const next={...row,coachName:replaceName(row.coachName)};
        if(Object.prototype.hasOwnProperty.call(row,'coachId'))next.coachId=replaceCoachId(row.coachId);
        return next;
      }),
      feedbacks:updateRows(data.feedbacks,rewriteBasicCoachRef),
      leads:updateRows(data.leads,row=>({...row,formalCoach:replaceName(row.formalCoach)})),
      students:updateRows(data.students,row=>{
        const next={...row,primaryCoach:replaceName(row.primaryCoach)};
        if(Object.prototype.hasOwnProperty.call(row,'primaryCoachId'))next.primaryCoachId=replaceCoachId(row.primaryCoachId);
        return next;
      }),
      packages:updateRows(data.packages,rewriteOwnerCoachRef),
      purchases:updateRows(data.purchases,rewriteOwnerCoachRef),
      entitlements:updateRows(data.entitlements,rewriteOwnerCoachRef)
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

  return {assertUniqueCoachName,buildCoachRenameUpdates,assertCanDeleteCoachName};
}

function createCoachRoutes(deps={}){
  const {
    init,sendJson,getCachedScan,get,scan,put,del,filterLoadAllForUser,uuidv4,
    assertPhone,timed,withTimeout,scanFeedbacks,putFeedback,
    buildCoachRenameUpdates,assertCanDeleteCoachName,assertUniqueCoachName,
    T_COACHES,T_CLASSES,T_SCHEDULE,T_PLANS,T_USERS,T_FEEDBACKS,T_LEADS,T_STUDENTS,
    T_PACKAGES,T_PURCHASES,T_ENTITLEMENTS
  }=deps;

  async function loadCoachReferenceData(){
    const [classes,schedule,plans,users,feedbacks,leads,students,packages,purchases,entitlements]=await Promise.all([
      timed('scan classes for coach references',()=>scan(T_CLASSES).catch(()=>[])),
      timed('scan schedule for coach references',()=>scan(T_SCHEDULE).catch(()=>[])),
      timed('scan plans for coach references',()=>scan(T_PLANS).catch(()=>[])),
      timed('scan users for coach references',()=>scan(T_USERS).catch(()=>[])),
      timed('scan feedbacks for coach references',()=>withTimeout(scanFeedbacks().catch(()=>[]),3000,[])),
      timed('scan leads for coach references',()=>scan(T_LEADS).catch(()=>[])),
      timed('scan students for coach references',()=>scan(T_STUDENTS).catch(()=>[])),
      timed('scan packages for coach references',()=>scan(T_PACKAGES).catch(()=>[])),
      timed('scan purchases for coach references',()=>scan(T_PURCHASES).catch(()=>[])),
      timed('scan entitlements for coach references',()=>scan(T_ENTITLEMENTS).catch(()=>[]))
    ]);
    return {classes,schedule,plans,users,feedbacks,leads,students,packages,purchases,entitlements};
  }

  async function applyCoachRename(oldName,newName,ids={}){
    const updates=buildCoachRenameUpdates(oldName,newName,await loadCoachReferenceData(),new Date().toISOString(),ids);
    await Promise.all([
      ...updates.classes.map(r=>put(T_CLASSES,r.id,r)),
      ...updates.schedule.map(r=>put(T_SCHEDULE,r.id,r)),
      ...updates.plans.map(r=>put(T_PLANS,r.id,r)),
      ...updates.users.map(r=>put(T_USERS,r.id,r)),
      ...updates.feedbacks.map(r=>putFeedback(r.id,r)),
      ...updates.leads.map(r=>put(T_LEADS,r.id,r)),
      ...updates.students.map(r=>put(T_STUDENTS,r.id,r)),
      ...updates.packages.map(r=>put(T_PACKAGES,r.id,r)),
      ...updates.purchases.map(r=>put(T_PURCHASES,r.id,r)),
      ...updates.entitlements.map(r=>put(T_ENTITLEMENTS,r.id,r))
    ]);
    return updates;
  }

  return async function handleCoachRoutes({path,method,body,user,res}){
    if(path==='/coaches'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      if(method==='GET'){
        const rows=await getCachedScan(T_COACHES);
        return sendJson(res,filterLoadAllForUser({coaches:rows},user).coaches);
      }
      if(method==='POST'){
        const id=uuidv4();
        const name=String(body.name||'').trim();
        if(!name)return sendJson(res,{error:'请填写教练姓名'},400);
        assertUniqueCoachName(name,await getCachedScan(T_COACHES));
        const r={...body,name,phone:assertPhone(body.phone),id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
        await put(T_COACHES,id,r);
        return sendJson(res,r);
      }
    }
    const coM=path.match(/^\/coaches\/(.+)$/);
    if(coM){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      const id=coM[1];
      if(method==='PUT'){
        const old=await get(T_COACHES,id).catch(()=>null);
        if(!old)return sendJson(res,{error:'教练不存在'},404);
        const name=String(body.name||'').trim();
        if(!name)return sendJson(res,{error:'请填写教练姓名'},400);
        assertUniqueCoachName(name,await scan(T_COACHES),id);
        const r={...body,name,phone:assertPhone(body.phone),id,updatedAt:new Date().toISOString()};
        await put(T_COACHES,id,r);
        const coachUpdates=await applyCoachRename(old.name,name,{oldCoachId:old.id,newCoachId:id});
        return sendJson(res,{...r,coachUpdates});
      }
      if(method==='DELETE'){
        const old=await get(T_COACHES,id).catch(()=>null);
        if(!old)return sendJson(res,{success:true});
        assertCanDeleteCoachName(old.name,await loadCoachReferenceData(),old.id);
        await del(T_COACHES,id);
        return sendJson(res,{success:true});
      }
    }
    return false;
  };
}

module.exports={createCoachRoutes,createCoachRuleHelpers};
