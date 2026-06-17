function createCoachProposalRoutes(deps={}){
  const {
    init,sendJson,withTimeout,getCachedScan,filterLoadAllForUser,getCoachScheduleRowsForUser,
    buildCoachRefs,uuidv4,get,assertCanWriteCoachProposal,buildCoachProposalRecord,putCoachProposal,
    T_COACH_PROPOSALS,T_SCHEDULE,T_COACHES,T_USERS
  }=deps;

  return async function handleCoachProposalRoutes({path,method,body,user,res}){
    if(path==='/coach-proposals'){
      await init();
      if(method==='GET'){
        const rows=await withTimeout(getCachedScan(T_COACH_PROPOSALS).catch(()=>[]),3000,[]);
        if(user.role==='admin')return sendJson(res,filterLoadAllForUser({coachProposals:rows,schedule:await getCachedScan(T_SCHEDULE).catch(()=>[])},user).coachProposals);
        const [coaches,users]=await Promise.all([getCachedScan(T_COACHES).catch(()=>[]),getCachedScan(T_USERS).catch(()=>[])]);
        const scheduleRows=await getCoachScheduleRowsForUser(user,buildCoachRefs({coaches,users}));
        const scheduleIds=new Set(scheduleRows.map(row=>String(row.id||'')).filter(Boolean));
        return sendJson(res,rows.filter(row=>scheduleIds.has(String(row.scheduleId||''))));
      }
      if(method==='POST'){
        const id=uuidv4();
        const schedule=await get(T_SCHEDULE,body.scheduleId).catch(()=>null);
        if(!schedule)return sendJson(res,{error:'排课不存在'},404);
        const [coaches,users]=await Promise.all([getCachedScan(T_COACHES).catch(()=>[]),getCachedScan(T_USERS).catch(()=>[])]);
        try{assertCanWriteCoachProposal(user,schedule,buildCoachRefs({coaches,users}));}
        catch(e){return sendJson(res,{error:e.message},400);}
        const r=buildCoachProposalRecord(body,{id},user,schedule);
        await putCoachProposal(id,r);
        return sendJson(res,r);
      }
    }

    const cpM=path.match(/^\/coach-proposals\/(.+)$/);
    if(cpM){
      const id=cpM[1];
      if(method==='GET')return sendJson(res,await get(T_COACH_PROPOSALS,id));
      if(method==='PUT'){
        const ex=await get(T_COACH_PROPOSALS,id).catch(()=>null);
        if(!ex)return sendJson(res,{error:'教练提案不存在'},404);
        const schedule=await get(T_SCHEDULE,body.scheduleId||ex.scheduleId).catch(()=>null);
        if(!schedule)return sendJson(res,{error:'排课不存在'},404);
        const [coaches,users]=await Promise.all([getCachedScan(T_COACHES).catch(()=>[]),getCachedScan(T_USERS).catch(()=>[])]);
        try{assertCanWriteCoachProposal(user,schedule,buildCoachRefs({coaches,users}));}
        catch(e){return sendJson(res,{error:e.message},400);}
        const r=buildCoachProposalRecord({...ex,...body},{...ex,id},user,schedule);
        await putCoachProposal(id,r);
        return sendJson(res,r);
      }
    }

    return false;
  };
}

module.exports={createCoachProposalRoutes};
