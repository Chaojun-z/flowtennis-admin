function createAuthRoutes(deps={}){
  const {
    sendJson,jwt,JWT_SECRET,timedEndpointMetric,checkLoginRateLimit,recordLoginAttempt,
    loadLoginUser,verifyLoginPassword,mergeStoredAuthUser,assertAuthUserActive,
    LOGIN_STORAGE_TIMEOUT_ERROR,LOGIN_INVALID_ACCOUNT_ERROR,
    fetchWechatSession,extractWechatOpenId,getWechatUserByOpenId,
    get,put,bcrypt,bindWechatUserWithIndex,T_USERS
  }=deps;

  return async function handleAuthRoutes({path,method,body,req,user,res}){
    if(path==='/auth/login'&&method==='POST'){
      return timedEndpointMetric('auth.login',async()=>{
        const{username,password}=body;
        if(!username||!password)return sendJson(res,{error:'请填写账号和密码'},400);
        const rateLimit=checkLoginRateLimit(req,username);
        if(rateLimit.limited)return sendJson(res,{error:'登录失败次数过多，请稍后再试'},429);
        const user=await loadLoginUser(username);
        if(user?.__loginTimeout)return sendJson(res,{error:LOGIN_STORAGE_TIMEOUT_ERROR},503);
        if(!user){recordLoginAttempt(req,username,false);return sendJson(res,{error:'账号或密码错误'},401);}
        const passwordVerified=await verifyLoginPassword(username,password,user.password);
        if(passwordVerified?.invalidAccount)return sendJson(res,{error:LOGIN_INVALID_ACCOUNT_ERROR},500);
        if(!passwordVerified){recordLoginAttempt(req,username,false);return sendJson(res,{error:'账号或密码错误'},401);}
        const payload=mergeStoredAuthUser(null,user);
        try{assertAuthUserActive(payload);}catch(e){return sendJson(res,{error:e.message},403);}
        recordLoginAttempt(req,username,true);
        const token=jwt.sign(payload,JWT_SECRET,{expiresIn:'7d'});
        return sendJson(res,{token,user:payload});
      });
    }
    if(path==='/auth/wechat-login'&&method==='POST'){
      const code=String(body.code||'').trim();
      if(!code)return sendJson(res,{error:'缺少微信登录凭证'},400);
      const session=await fetchWechatSession(code);
      const openid=extractWechatOpenId(session);
      const account=await getWechatUserByOpenId(openid);
      if(!account)return sendJson(res,{error:'微信未绑定教练账号，请先使用账号密码登录完成绑定'},404);
      const payload=mergeStoredAuthUser(null,account);
      try{assertAuthUserActive(payload);}catch(e){return sendJson(res,{error:e.message},403);}
      const token=jwt.sign(payload,JWT_SECRET,{expiresIn:'7d'});
      return sendJson(res,{token,user:payload});
    }
    if(path==='/auth/wechat-bind'&&method==='POST'){
      if(!user)return false;
      const code=String(body.code||'').trim();
      if(!code)return sendJson(res,{error:'缺少微信登录凭证'},400);
      const session=await fetchWechatSession(code);
      const openid=extractWechatOpenId(session);
      const stored=await get(T_USERS,user.id);
      if(!stored)return sendJson(res,{error:'用户不存在'},404);
      await bindWechatUserWithIndex(stored,openid);
      return sendJson(res,{success:true,wechatBound:true});
    }
    if(path==='/auth/change-password'&&method==='POST'){
      if(!user)return false;
      const u=await get(T_USERS,user.id);
      if(!await bcrypt.compare(body.oldPassword,u.password))return sendJson(res,{error:'原密码错误'},400);
      await put(T_USERS,user.id,{...u,password:await bcrypt.hash(body.newPassword,10)});
      return sendJson(res,{success:true});
    }
    if(path==='/auth/me'&&!user)return false;
    if(path==='/auth/me')return sendJson(res,user);
    return false;
  };
}

module.exports={createAuthRoutes};
