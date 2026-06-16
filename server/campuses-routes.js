function createCampusRoutes(deps={}){
  const {
    init,sendJson,listCampusesWithDefaults,filterLoadAllForUser,uuidv4,
    put,del,scan,assertCanDeleteCampus,
    T_CAMPUSES,T_STUDENTS,T_COACHES,T_CLASSES,T_SCHEDULE,T_COURTS,T_PACKAGES,T_ENTITLEMENTS
  }=deps;

  return async function handleCampusRoutes({path,method,body,user,res}){
    if(path==='/campuses'){
      if(method==='GET'){
        const result=await listCampusesWithDefaults();
        return sendJson(res,filterLoadAllForUser({campuses:result},user).campuses);
      }
      await init();
      if(method==='POST'){
        if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
        const id=body.code||uuidv4();
        const r={...body,id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
        await put(T_CAMPUSES,id,r);
        return sendJson(res,r);
      }
    }
    const caM=path.match(/^\/campuses\/(.+)$/);
    if(caM){
      const id=caM[1];
      if(method==='PUT'){
        if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
        const r={...body,id,updatedAt:new Date().toISOString()};
        await put(T_CAMPUSES,id,r);
        return sendJson(res,r);
      }
      if(method==='DELETE'){
        if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
        const [students,coaches,classes,schedule,courts,packages,entitlements]=await Promise.all([
          scan(T_STUDENTS).catch(()=>[]),
          scan(T_COACHES).catch(()=>[]),
          scan(T_CLASSES).catch(()=>[]),
          scan(T_SCHEDULE).catch(()=>[]),
          scan(T_COURTS).catch(()=>[]),
          scan(T_PACKAGES).catch(()=>[]),
          scan(T_ENTITLEMENTS).catch(()=>[])
        ]);
        assertCanDeleteCampus(id,{students,coaches,classes,schedule,courts,packages,entitlements});
        await del(T_CAMPUSES,id);
        return sendJson(res,{success:true});
      }
    }
    return false;
  };
}

module.exports={createCampusRoutes};
