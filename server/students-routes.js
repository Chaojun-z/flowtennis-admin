function createStudentRoutes(deps={}){
  const {
    init,sendJson,getFastStudentsRead,getCachedScan,filterLoadAllForUser,buildCoachRefs,
    assertStudentWriteAccess,uuidv4,assertPhone,put,get,buildStudentReminderBindToken,
    buildStudentReminderLinkUpdate,normalizeStudentReminderMode,normalizeStudentReminderCustomHours,
    buildStudentOfficialAccountUnboundUpdate,applyStudentIdentityUpdate,deleteStudentCascade,
    T_STUDENTS,T_SCHEDULE,T_CLASSES,T_COACHES,T_USERS
  }=deps;

  return async function handleStudentRoutes({path,method,body,user,res}){
    if(path==='/students'){
      await init();
      if(method==='GET'){
        const rows=await getFastStudentsRead();
        if(user.role==='admin')return sendJson(res,filterLoadAllForUser({students:rows},user).students);
        /* hot-cache guard: filterLoadAllForUser({students:rows,schedule,classes},user).students */
        const [schedule,classes,coaches,users]=await Promise.all([
          getCachedScan(T_SCHEDULE).catch(()=>[]),
          getCachedScan(T_CLASSES).catch(()=>[]),
          getCachedScan(T_COACHES).catch(()=>[]),
          getCachedScan(T_USERS).catch(()=>[])
        ]);
        const coachRefs=buildCoachRefs({coaches,users});
        return sendJson(res,filterLoadAllForUser({students:rows,schedule,classes,coaches},user,coachRefs).students);
      }
      if(method==='POST'){
        assertStudentWriteAccess(user);
        const id=uuidv4();
        const r={...body,phone:assertPhone(body.phone),id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
        await put(T_STUDENTS,id,r);
        return sendJson(res,r);
      }
    }

    const studentReminderLinkM=path.match(/^\/students\/([^/]+)\/reminder-link$/);
    if(studentReminderLinkM&&method==='POST'){
      assertStudentWriteAccess(user);
      const id=studentReminderLinkM[1];
      const student=await get(T_STUDENTS,id).catch(()=>null);
      if(!student)return sendJson(res,{error:'学员不存在'},404);
      const tokenValue=buildStudentReminderBindToken();
      const now=new Date().toISOString();
      const next={...buildStudentReminderLinkUpdate(student,tokenValue,now),updatedAt:now};
      await put(T_STUDENTS,id,next);
      return sendJson(res,{success:true,student:next,bindToken:tokenValue,bindPath:`/student-reminder-bind?t=${encodeURIComponent(tokenValue)}`});
    }

    const studentReminderSettingsM=path.match(/^\/students\/([^/]+)\/reminder-settings$/);
    if(studentReminderSettingsM&&method==='POST'){
      assertStudentWriteAccess(user);
      const id=studentReminderSettingsM[1];
      const student=await get(T_STUDENTS,id).catch(()=>null);
      if(!student)return sendJson(res,{error:'学员不存在'},404);
      const now=new Date().toISOString();
      const next={...student,officialAccountReminderMode:normalizeStudentReminderMode(body.mode),officialAccountReminderCustomHours:normalizeStudentReminderCustomHours(body.customHours),updatedAt:now};
      await put(T_STUDENTS,id,next);
      return sendJson(res,{success:true,student:next});
    }

    const studentReminderUnbindM=path.match(/^\/students\/([^/]+)\/reminder-unbind$/);
    if(studentReminderUnbindM&&method==='POST'){
      assertStudentWriteAccess(user);
      const id=studentReminderUnbindM[1];
      const student=await get(T_STUDENTS,id).catch(()=>null);
      if(!student)return sendJson(res,{error:'学员不存在'},404);
      const now=new Date().toISOString();
      const next={...buildStudentOfficialAccountUnboundUpdate(student),updatedAt:now};
      await put(T_STUDENTS,id,next);
      return sendJson(res,{success:true,student:next});
    }

    const sM=path.match(/^\/students\/(.+)$/);
    if(sM){
      const id=sM[1];
      if(method==='PUT'){
        assertStudentWriteAccess(user);
        const old=await get(T_STUDENTS,id).catch(()=>null);
        const r={...(old||{}),...body,phone:assertPhone(body.phone),id,updatedAt:new Date().toISOString()};
        await put(T_STUDENTS,id,r);
        const studentUpdates=old?await applyStudentIdentityUpdate(old,r):{plans:[],schedule:[],purchases:[],entitlements:[],feedbacks:[]};
        return sendJson(res,{...r,studentUpdates});
      }
      if(method==='DELETE'){
        try{
          return sendJson(res,await deleteStudentCascade(id,{confirm:body.confirm,user}));
        }catch(err){
          const msg=String(err?.message||err);
          return sendJson(res,{error:msg},msg==='无权限'?403:/不存在/.test(msg)?404:400);
        }
      }
    }

    return false;
  };
}

module.exports={createStudentRoutes};
