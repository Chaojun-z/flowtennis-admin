function createAdminUserRoutes(deps={}){
  const {
    init,sendJson,bcrypt,assertPhone,buildStoredPermissionFields,put,get,
    unbindWechatUserWithIndex,buildOfficialAccountUnboundUser,isProductionRuntime,
    scanFirstRows,getCachedScan,buildAdminUserView,isVisibleAdminUser,
    PRODUCTION_PAGE_READ_LIMITS,ADMIN_USER_LIST_PROJECTION_FIELDS,T_USERS
  }=deps;

  return async function handleAdminUserRoutes({path,method,body,user,res}){
    if(path==='/admin/create-user'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const{id,name,password,role,coachId,coachName}=body;
      if(!id||!name||!password)return sendJson(res,{error:'缺少必填字段'},400);
      const nextRole=role||'editor';
      const hashed=await bcrypt.hash(password,10);
      const nextCoachName=coachName||(nextRole==='editor'?name:'');
      const phone=assertPhone(body.phone||'');
      const permissionFields=buildStoredPermissionFields({...body,role:nextRole,coachId:coachId||'',coachName:nextCoachName,name});
      const nextUser={id,name,phone,password:hashed,role:nextRole,status:'active',coachId:coachId||'',coachName:nextCoachName,officialAccountOpenId:'',officialAccountBoundAt:'',...permissionFields};
      await put(T_USERS,id,nextUser);
      return sendJson(res,{success:true,id,name,phone,role:nextRole,status:'active',coachId:coachId||'',coachName:nextCoachName,officialAccountBound:false,officialAccountBoundAt:'',...permissionFields});
    }
    if(path==='/admin/update-user'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const{id,coachId,coachName,status}=body;
      if(!id)return sendJson(res,{error:'缺少用户ID'},400);
      const u=await get(T_USERS,id);
      if(!u)return sendJson(res,{error:'用户不存在'},404);
      const nextRole=String(body.role||u.role||'editor').trim()==='admin'?'admin':'editor';
      let updates={...u,role:nextRole,coachId:nextRole==='editor'?(coachId||''):'',status:status||u.status||'active'};
      if(body.name)updates.name=body.name;
      if(Object.prototype.hasOwnProperty.call(body,'phone'))updates.phone=assertPhone(body.phone||'');
      updates.coachName=nextRole==='editor'?(coachName||updates.name||u.name):'';
      updates={...updates,...buildStoredPermissionFields({
        ...updates,
        role:nextRole,
        dataScope:Object.prototype.hasOwnProperty.call(body,'dataScope')?body.dataScope:updates.dataScope,
        campusIds:Object.prototype.hasOwnProperty.call(body,'campusIds')?body.campusIds:updates.campusIds,
        featurePermissions:Object.prototype.hasOwnProperty.call(body,'featurePermissions')?body.featurePermissions:updates.featurePermissions,
        permissions:Object.prototype.hasOwnProperty.call(body,'permissions')?body.permissions:updates.permissions,
        matchPermissions:Object.prototype.hasOwnProperty.call(body,'matchPermissions')?body.matchPermissions:updates.matchPermissions,
        matchOps:Object.prototype.hasOwnProperty.call(body,'matchOps')?body.matchOps:updates.matchOps,
        matchFinance:Object.prototype.hasOwnProperty.call(body,'matchFinance')?body.matchFinance:updates.matchFinance
      })};
      if(body.clearWechat){await unbindWechatUserWithIndex(updates);return sendJson(res,{success:true});}
      if(body.clearOfficialAccount){updates=buildOfficialAccountUnboundUser(updates);}
      await put(T_USERS,id,updates);
      return sendJson(res,{success:true});
    }
    if(path==='/admin/reset-user-password'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const{id,password}=body;
      if(!id||!password)return sendJson(res,{error:'缺少账号或新密码'},400);
      const u=await get(T_USERS,id);
      if(!u)return sendJson(res,{error:'用户不存在'},404);
      await put(T_USERS,id,{...u,password:await bcrypt.hash(password,10),updatedAt:new Date().toISOString()});
      return sendJson(res,{success:true});
    }
    if(path==='/admin/users'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const all=isProductionRuntime()?await scanFirstRows(T_USERS,{limit:PRODUCTION_PAGE_READ_LIMITS.adminUsers,columns:ADMIN_USER_LIST_PROJECTION_FIELDS}).catch(()=>[]):await getCachedScan(T_USERS,{columns:ADMIN_USER_LIST_PROJECTION_FIELDS});
      return sendJson(res,all.filter(isVisibleAdminUser).map(buildAdminUserView));
    }
    return false;
  };
}

module.exports={createAdminUserRoutes};
