function createMatchRoutes(deps={}){
  const {
    sendJson,uuidv4,MATCH_MINIPROGRAM_SECRET,isProductionRuntime,fetchWechatSession,extractWechatOpenId,
    getMatchSqlPool,buildMatchUserToken,canMatchUserCreate,ensureMatchUserResponse,
    listMatchesForViewer,createMatchForUser,getMatchForViewer,toMatchDetailResponse,updateMatchForUser,
    cancelMatchForUser,registerMatchUser,cancelRegistrationForUser,submitMatchTechnicalRating,
    listMyMatches,getMatchProfile,updateMatchProfile,fetchWechatPhoneNumber,getMatchSettings,
    creatorConfirmMatchAttendance,listMatchNotifications,listMatchPlayers,requireAdminUser,
    requireMatchAdminPermission,listAdminMatches,shouldUseEmptyMatchAdminListFallback,saveMatchSettings,
    getMatchFinanceDailyReportForAdmin,adminBookMatch,adminCancelMatch,confirmMatchAttendance,
    adminHandleBookedWithdrawal,adminTransferMatchReplacement,generateMatchFeeLedger,markMatchFeeSplit
  }=deps;

  function requireMatchUser(req,res){
    const matchUser=ensureMatchUserResponse(req,res);
    return matchUser||null;
  }

  return async function handleMatchRoutes({path,method,body,req,res,user,query}){
    if(path==='/auth/wechat-mini-login'&&method==='POST'){
      const code=String(body.code||'').trim();
      if(!code)return sendJson(res,{error:'缺少微信登录凭证'},400);
      const session=(!isProductionRuntime()&&!MATCH_MINIPROGRAM_SECRET)
        ? {openid:'preview-match-openid',unionid:'preview-match-unionid'}
        : await fetchWechatSession(code,'match');
      const openid=extractWechatOpenId(session);
      const unionid=session.unionid?String(session.unionid):'';
      const pool=getMatchSqlPool();
      const existing=await pool.query('SELECT * FROM match_users WHERE openid=$1 LIMIT 1',[openid]);
      let matchUser=existing.rows[0];
      if(!matchUser){
        const now=new Date().toISOString();
        matchUser={id:uuidv4(),openid,unionid,nickName:'',avatarUrl:'',phone:'',ntrpLevel:'',createdAt:now,updatedAt:now};
        await pool.query(
          'INSERT INTO match_users(id,openid,unionid,nickName,avatarUrl,phone,ntrpLevel,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())',
          [matchUser.id,matchUser.openid,matchUser.unionid,matchUser.nickName,matchUser.avatarUrl,matchUser.phone,matchUser.ntrpLevel]
        );
      }
      return sendJson(res,{token:buildMatchUserToken(matchUser),user:{id:matchUser.id,type:'match_user',openid:matchUser.openid,phone:matchUser.phone||'',ntrpLevel:matchUser.ntrplevel||matchUser.ntrpLevel||'',canCreateMatch:await canMatchUserCreate(matchUser.id)}});
    }
    if(path==='/matches'&&method==='GET'){
      const matchUser=requireMatchUser(req,res);if(!matchUser)return true;
      return sendJson(res,{items:await listMatchesForViewer(matchUser.id)});
    }
    if(path==='/matches'&&method==='POST'){
      const matchUser=requireMatchUser(req,res);if(!matchUser)return true;
      const profile=await getMatchSqlPool().query('SELECT phone FROM match_users WHERE id=$1',[matchUser.id]);
      if(!profile.rows[0]?.phone)return sendJson(res,{error:'请先授权手机号'},409);
      return sendJson(res,await createMatchForUser(matchUser.id,body));
    }
    const matchDetailM=path.match(/^\/matches\/([^/]+)$/);
    if(matchDetailM&&method==='GET'){
      const matchUser=requireMatchUser(req,res);if(!matchUser)return true;
      const match=await getMatchForViewer(matchDetailM[1],matchUser.id);
      if(!match)return sendJson(res,{error:'球局不存在'},404);
      return sendJson(res,toMatchDetailResponse(match));
    }
    const matchUpdateM=path.match(/^\/matches\/([^/]+)$/);
    if(matchUpdateM&&method==='PUT'){
      const matchUser=requireMatchUser(req,res);if(!matchUser)return true;
      try{
        await updateMatchForUser(matchUpdateM[1],matchUser.id,body);
        const match=await getMatchForViewer(matchUpdateM[1],matchUser.id);
        return sendJson(res,toMatchDetailResponse(match));
      }catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    const matchCancelM=path.match(/^\/matches\/([^/]+)\/cancel$/);
    if(matchCancelM&&method==='POST'){
      const matchUser=requireMatchUser(req,res);if(!matchUser)return true;
      try{return sendJson(res,await cancelMatchForUser(matchCancelM[1],matchUser.id,body.reason));}
      catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    const matchRegisterM=path.match(/^\/matches\/([^/]+)\/register$/);
    if(matchRegisterM&&method==='POST'){
      const matchUser=requireMatchUser(req,res);if(!matchUser)return true;
      const profile=await getMatchSqlPool().query('SELECT phone FROM match_users WHERE id=$1',[matchUser.id]);
      if(!profile.rows[0]?.phone)return sendJson(res,{error:'请先授权手机号'},409);
      try{return sendJson(res,await registerMatchUser(matchRegisterM[1],matchUser.id));}
      catch(err){
        const message=String(err?.message||err);
        return sendJson(res,{error:message},/名额已满|已报名/.test(message)?409:400);
      }
    }
    const matchCancelRegisterM=path.match(/^\/matches\/([^/]+)\/cancel-registration$/);
    if(matchCancelRegisterM&&method==='POST'){
      const matchUser=requireMatchUser(req,res);if(!matchUser)return true;
      try{return sendJson(res,await cancelRegistrationForUser(matchCancelRegisterM[1],matchUser.id));}
      catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    const matchRatingM=path.match(/^\/matches\/([^/]+)\/technical-rating$/);
    if(matchRatingM&&method==='POST'){
      const matchUser=requireMatchUser(req,res);if(!matchUser)return true;
      try{return sendJson(res,await submitMatchTechnicalRating(matchRatingM[1],matchUser.id,body));}
      catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    if(path==='/my-matches'&&method==='GET'){
      const matchUser=requireMatchUser(req,res);if(!matchUser)return true;
      return sendJson(res,{items:await listMyMatches(matchUser.id)});
    }
    if(path==='/match-profile'&&method==='GET'){
      const matchUser=requireMatchUser(req,res);if(!matchUser)return true;
      return sendJson(res,await getMatchProfile(matchUser.id));
    }
    if(path==='/match-profile'&&method==='POST'){
      const matchUser=requireMatchUser(req,res);if(!matchUser)return true;
      return sendJson(res,await updateMatchProfile(matchUser.id,body));
    }
    if(path==='/match-profile/phone'&&method==='POST'){
      const matchUser=requireMatchUser(req,res);if(!matchUser)return true;
      return sendJson(res,await updateMatchProfile(matchUser.id,{phone:body.phone}));
    }
    if(path==='/match-profile/phone-code'&&method==='POST'){
      const matchUser=requireMatchUser(req,res);if(!matchUser)return true;
      try{
        const phone=await fetchWechatPhoneNumber(String(body.code||'').trim(),'match');
        return sendJson(res,await updateMatchProfile(matchUser.id,{phone}));
      }catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    if(path==='/match-settings'&&method==='GET'){
      const matchUser=requireMatchUser(req,res);if(!matchUser)return true;
      return sendJson(res,await getMatchSettings());
    }
    if(path==='/match-attendance/creator-confirm'&&method==='POST'){
      const matchUser=requireMatchUser(req,res);if(!matchUser)return true;
      try{return sendJson(res,await creatorConfirmMatchAttendance(body.matchId,matchUser.id,body.registrationId,body.finalAttendanceStatus));}
      catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    if(path==='/match-notifications'&&method==='GET'){
      const matchUser=requireMatchUser(req,res);if(!matchUser)return true;
      return sendJson(res,{items:await listMatchNotifications(matchUser.id)});
    }
    if(path==='/match-players'&&method==='GET'){
      const matchUser=requireMatchUser(req,res);if(!matchUser)return true;
      return sendJson(res,{items:await listMatchPlayers()});
    }
    if(!user)return false;
    if(path==='/admin/matches'&&method==='GET'){
      requireAdminUser(user);
      try{
        return sendJson(res,{items:await listAdminMatches()});
      }catch(err){
        if(shouldUseEmptyMatchAdminListFallback(err)){
          console.warn('[match-admin] database unavailable, returning empty local list',String(err?.message||err));
          return sendJson(res,{items:[],databaseUnavailable:true,error:'约球数据库未连接'});
        }
        throw err;
      }
    }
    if(path==='/admin/matches/settings'&&method==='GET'){
      requireMatchAdminPermission(user,'match_ops');
      return sendJson(res,await getMatchSettings());
    }
    if(path==='/admin/matches/settings'&&method==='POST'){
      requireMatchAdminPermission(user,'match_ops');
      return sendJson(res,await saveMatchSettings(body,user.id));
    }
    if(path==='/admin/matches/finance-daily'&&method==='GET'){
      requireMatchAdminPermission(user,'match_finance');
      return sendJson(res,await getMatchFinanceDailyReportForAdmin(query.get('date')||new Date().toISOString().slice(0,10)));
    }
    const adminBookingM=path.match(/^\/admin\/matches\/([^/]+)\/booking$/);
    if(adminBookingM&&method==='POST'){
      requireMatchAdminPermission(user,'match_ops');
      try{return sendJson(res,await adminBookMatch(adminBookingM[1],user.id,body));}
      catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    const adminCancelM=path.match(/^\/admin\/matches\/([^/]+)\/cancel$/);
    if(adminCancelM&&method==='POST'){
      requireMatchAdminPermission(user,'match_ops');
      try{return sendJson(res,await adminCancelMatch(adminCancelM[1],user.id,body.reason));}
      catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    const adminAttendanceM=path.match(/^\/admin\/matches\/([^/]+)\/attendance$/);
    if(adminAttendanceM&&method==='POST'){
      requireMatchAdminPermission(user,'match_ops');
      try{return sendJson(res,await confirmMatchAttendance(adminAttendanceM[1],user.id,body.items||body.participants||[]));}
      catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    const adminWithdrawalM=path.match(/^\/admin\/matches\/([^/]+)\/registrations\/([^/]+)\/withdrawal$/);
    if(adminWithdrawalM&&method==='POST'){
      requireMatchAdminPermission(user,'match_ops');
      try{return sendJson(res,await adminHandleBookedWithdrawal(adminWithdrawalM[1],adminWithdrawalM[2],user.id,body));}
      catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    const adminReplacementM=path.match(/^\/admin\/matches\/([^/]+)\/replacements\/transfer$/);
    if(adminReplacementM&&method==='POST'){
      requireMatchAdminPermission(user,'match_ops');
      requireMatchAdminPermission(user,'match_finance');
      try{return sendJson(res,await adminTransferMatchReplacement(adminReplacementM[1],user.id,body));}
      catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    const adminFeeConfirmM=path.match(/^\/admin\/matches\/([^/]+)\/fees\/confirm$/);
    if(adminFeeConfirmM&&method==='POST'){
      requireMatchAdminPermission(user,'match_finance');
      try{return sendJson(res,await generateMatchFeeLedger(adminFeeConfirmM[1],user.id,body));}
      catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    const adminFeeSplitM=path.match(/^\/admin\/matches\/([^/]+)\/fees\/splits\/([^/]+)$/);
    if(adminFeeSplitM&&method==='POST'){
      requireMatchAdminPermission(user,'match_finance');
      try{return sendJson(res,await markMatchFeeSplit(adminFeeSplitM[1],adminFeeSplitM[2],user.id,body));}
      catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    return false;
  };
}

module.exports={createMatchRoutes};
