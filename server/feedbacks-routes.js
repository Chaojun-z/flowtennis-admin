function createFeedbackRoutes(deps={}){
  const {
    init,sendJson,withTimeout,getCachedScan,filterLoadAllForUser,timedEndpointMetric,
    uuidv4,get,buildCoachRefs,assertCanWriteFeedback,buildFeedbackRecord,putFeedback,
    T_FEEDBACKS,T_SCHEDULE,T_COACHES,T_USERS
  }=deps;

  return async function handleFeedbackRoutes({path,method,body,user,res}){
    if(path==='/feedbacks'){
      await init();
      if(method==='GET'){
        const rows=await withTimeout(getCachedScan(T_FEEDBACKS).catch(()=>[]),3000,[]);
        if(user.role==='admin')return sendJson(res,filterLoadAllForUser({feedbacks:rows,schedule:await getCachedScan(T_SCHEDULE).catch(()=>[])},user).feedbacks);
        return sendJson(res,rows);
      }
      if(method==='POST'){
        return timedEndpointMetric('feedback.save',async()=>{
          const id=uuidv4();
          const schedule=await get(T_SCHEDULE,body.scheduleId).catch(()=>null);
          if(!schedule)return sendJson(res,{error:'排课不存在'},404);
          const [coaches,users]=await Promise.all([getCachedScan(T_COACHES).catch(()=>[]),getCachedScan(T_USERS).catch(()=>[])]);
          assertCanWriteFeedback(user,schedule,buildCoachRefs({coaches,users}));
          const r=buildFeedbackRecord(body,{id},user);
          await putFeedback(id,r);
          return sendJson(res,r);
        },{mode:'create'});
      }
    }

    const fbM=path.match(/^\/feedbacks\/(.+)$/);
    if(fbM){
      const id=fbM[1];
      if(method==='GET')return sendJson(res,await get(T_FEEDBACKS,id));
      if(method==='PUT'){
        return timedEndpointMetric('feedback.save',async()=>{
          const ex=await get(T_FEEDBACKS,id).catch(()=>null);
          if(!ex)return sendJson(res,{error:'反馈不存在'},404);
          const schedule=await get(T_SCHEDULE,body.scheduleId||ex.scheduleId).catch(()=>null);
          if(!schedule)return sendJson(res,{error:'排课不存在'},404);
          const [coaches,users]=await Promise.all([getCachedScan(T_COACHES).catch(()=>[]),getCachedScan(T_USERS).catch(()=>[])]);
          assertCanWriteFeedback(user,schedule,buildCoachRefs({coaches,users}));
          const r=buildFeedbackRecord({...ex,...body},{...ex,id},user);
          await putFeedback(id,r);
          return sendJson(res,r);
        },{mode:'update'});
      }
    }

    return false;
  };
}

module.exports={createFeedbackRoutes};
