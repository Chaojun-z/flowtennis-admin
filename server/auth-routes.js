function createAuthRoutes(deps={}){
  const {
    sendJson,fetchWechatSession,extractWechatOpenId,get,bindWechatUserWithIndex,T_USERS
  }=deps;

  return async function handleAuthRoutes({path,method,body,user,res}){
    if(path==='/auth/wechat-bind'&&method==='POST'){
      const code=String(body.code||'').trim();
      if(!code)return sendJson(res,{error:'缺少微信登录凭证'},400);
      const session=await fetchWechatSession(code);
      const openid=extractWechatOpenId(session);
      const stored=await get(T_USERS,user.id);
      if(!stored)return sendJson(res,{error:'用户不存在'},404);
      await bindWechatUserWithIndex(stored,openid);
      return sendJson(res,{success:true,wechatBound:true});
    }
    if(path==='/auth/me')return sendJson(res,user);
    return false;
  };
}

module.exports={createAuthRoutes};
