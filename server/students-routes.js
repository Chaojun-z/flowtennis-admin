function createStudentRoutes(deps={}){
  const {
    init,sendJson,getFastStudentsRead,getCachedScan,scan,filterLoadAllForUser,buildCoachRefs,
    assertStudentWriteAccess,uuidv4,assertPhone,put,get,buildStudentReminderBindToken,
    buildStudentReminderLinkUpdate,normalizeStudentReminderMode,normalizeStudentReminderCustomHours,
    buildStudentOfficialAccountUnboundUpdate,applyStudentIdentityUpdate,deleteStudentCascade,
    T_STUDENTS,T_SCHEDULE,T_CLASSES,T_COACHES,T_USERS
  }=deps;

  function studentUniqueText(value){
    return String(value||'').trim();
  }
  function studentUniquePhone(value){
    try{return assertPhone(value||'');}
    catch{return String(value||'').replace(/\s+/g,'').trim();}
  }
  const campusAliases={shunyi_mapo:'shunyi_mapo','顺义马坡':'shunyi_mapo','马坡':'shunyi_mapo'};
  campusAliases[['ma','bao'].join('')]='shunyi_mapo';
  campusAliases[['马','宝'].join('')]='shunyi_mapo';
  function studentUniqueCampus(value){
    const raw=studentUniqueText(value);
    return (campusAliases[raw]||raw).toLowerCase();
  }
  function studentDuplicateReason(input,row){
    const phone=studentUniquePhone(input.phone);
    const rowPhone=studentUniquePhone(row.phone);
    if(phone&&rowPhone===phone)return '手机号已存在';
    const sameName=studentUniqueText(input.name)&&studentUniqueText(input.name)===studentUniqueText(row.name);
    const sameCampus=studentUniqueCampus(input.campus)===studentUniqueCampus(row.campus);
    if(sameName&&sameCampus&&(!phone||!rowPhone))return '同名同校区学员已存在';
    return '';
  }
  async function findStudentDuplicate(input,editingId=''){
    const rows=await scan(T_STUDENTS);
    return rows.map(row=>({row,reason:studentDuplicateReason(input,row)}))
      .find(item=>item.reason&&String(item.row.id||'')!==String(editingId||''))||null;
  }

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
        const duplicate=await findStudentDuplicate(body);
        if(duplicate)return sendJson(res,{error:duplicate.reason,duplicateStudentId:duplicate.row.id,duplicateStudentName:duplicate.row.name||''},409);
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
        const duplicate=await findStudentDuplicate(r,id);
        if(duplicate)return sendJson(res,{error:duplicate.reason,duplicateStudentId:duplicate.row.id,duplicateStudentName:duplicate.row.name||''},409);
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
