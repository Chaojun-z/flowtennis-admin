const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const LOGIN_STORAGE_TIMEOUT_ERROR='登录服务暂时超时，请重试';
const LOGIN_ROW_TIMEOUT_MS=4500;
const LOGIN_SCAN_TIMEOUT_MS=4500;
const LOGIN_ROW_RETRY_LIMIT=2;
const LOGIN_INVALID_ACCOUNT_ERROR='账号数据异常，请联系管理员处理';
const LOGIN_RATE_LIMIT_WINDOW_MS=15*60*1000;
const LOGIN_RATE_LIMIT_MAX_FAILURES=10;
const loginRateLimitBuckets=new Map();

function loginRateLimitKey(req,username){
  const forwarded=String(req?.headers?.['x-forwarded-for']||'').split(',')[0].trim();
  const ip=forwarded||String(req?.socket?.remoteAddress||req?.connection?.remoteAddress||'unknown');
  return `${ip}:${String(username||'').trim().toLowerCase()}`;
}
function checkLoginRateLimit(req,username,now=Date.now()){
  const key=loginRateLimitKey(req,username);
  const bucket=loginRateLimitBuckets.get(key);
  if(!bucket)return {limited:false,key};
  if(bucket.resetAt<=now){loginRateLimitBuckets.delete(key);return {limited:false,key};}
  return {limited:bucket.count>=LOGIN_RATE_LIMIT_MAX_FAILURES,retryAfterMs:bucket.resetAt-now,key};
}
function recordLoginAttempt(req,username,success,now=Date.now()){
  const key=loginRateLimitKey(req,username);
  if(success){loginRateLimitBuckets.delete(key);return;}
  const current=loginRateLimitBuckets.get(key);
  if(!current||current.resetAt<=now){
    loginRateLimitBuckets.set(key,{count:1,resetAt:now+LOGIN_RATE_LIMIT_WINDOW_MS});
    return;
  }
  current.count+=1;
}

function createAuthServices({
  JWT_SECRET,
  normalizePermissionProfile,
  userHasFeaturePermission,
  getCachedRow,
  getCachedScan,
  isTableMissingError,
  withTimeout,
  T_USERS,
  sendJson
}){
  function isTransientLoginStorageError(err){
    return /Client network socket disconnected before secure TLS connection was established|ECONNRESET|ETIMEDOUT|socket hang up|EAI_AGAIN|timeout/i.test(String(err?.message||err||''));
  }
  async function loadLoginUser(username){
    const rowTimeout=Symbol('login-row-timeout');
    const scanTimeout=Symbol('login-scan-timeout');
    for(let attempt=1;attempt<=LOGIN_ROW_RETRY_LIMIT;attempt++){
      try{
        const user=await withTimeout(getCachedRow(T_USERS,username),LOGIN_ROW_TIMEOUT_MS,rowTimeout);
        if(user!==rowTimeout)return user;
        console.warn(`[auth/login] ft_users row lookup timed out for ${username} on attempt ${attempt}/${LOGIN_ROW_RETRY_LIMIT}`);
      }catch(err){
        if(!isTableMissingError(err)&&!isTransientLoginStorageError(err))throw err;
        if(isTableMissingError(err))return null;
        console.warn(`[auth/login] ft_users row lookup failed for ${username} on attempt ${attempt}/${LOGIN_ROW_RETRY_LIMIT}: ${err.message||err}`);
      }
    }
    console.warn(`[auth/login] ft_users row lookup exhausted for ${username}, falling back to user scan cache`);
    try{
      const rows=await withTimeout(getCachedScan(T_USERS).catch((err)=>{
        if(isTableMissingError(err))return [];
        throw err;
      }),LOGIN_SCAN_TIMEOUT_MS,scanTimeout);
      if(rows===scanTimeout)return {__loginTimeout:true};
      return (Array.isArray(rows)?rows:[]).find((item)=>String(item?.id||'')===String(username))||null;
    }catch(err){
      if(isTableMissingError(err))return null;
      if(isTransientLoginStorageError(err))return {__loginTimeout:true};
      throw err;
    }
  }
  async function verifyLoginPassword(username,inputPassword,storedPassword){
    try{
      return await bcrypt.compare(inputPassword,storedPassword);
    }catch(err){
      console.error(`[auth/login] password compare failed for ${username}:`, err);
      return {invalidAccount:true};
    }
  }
  function authUser(req){const token=(req.headers.authorization||'').replace('Bearer ','');if(!token)return null;try{return jwt.verify(token,JWT_SECRET);}catch{return null;}}
  function mergeStoredAuthUser(tokenUser,storedUser){
    const source=storedUser||tokenUser||{};
    const role=source.role||tokenUser?.role||'';
    const name=source.name||tokenUser?.name||'';
    const id=source.id||tokenUser?.id||'';
    const username=source.username||tokenUser?.username||'';
    const profile=normalizePermissionProfile({...tokenUser,...source,role,name,id,username});
    return {
      id,
      name,
      role:profile.role,
      status:source.status||tokenUser?.status||'active',
      username,
      systemType:profile.systemType,
      dataScope:profile.dataScope,
      campusIds:profile.campusIds,
      coachId:source.coachId||tokenUser?.coachId||(profile.role==='editor'?(id||username):''),
      coachName:source.coachName||(profile.role==='editor'?name:(tokenUser?.coachName||'')),
      featurePermissions:profile.featurePermissions,
      permissions:profile.featurePermissions,
      matchPermissions:profile.featurePermissions
    };
  }
  function assertAuthUserActive(user){
    if(String(user?.status||'active')==='inactive')throw new Error('账号已停用');
  }
  function requireAdminUser(user){
    if(user?.type==='match_user')throw new Error('无管理端权限');
    if(!user?.id)throw new Error('未登录');
    return user;
  }
  function requireMatchAdminPermission(user,permission){
    requireAdminUser(user);
    if(userHasFeaturePermission(user,permission))return true;
    throw new Error(permission==='match_finance'?'无约球财务权限':'无约球运营权限');
  }
  function requireMatchUser(req){
    const user=authUser(req);
    if(!user||user.type!=='match_user')throw new Error('未登录');
    return user;
  }
  function ensureMatchUserResponse(req,res){
    try{return requireMatchUser(req);}
    catch(err){sendJson(res,{error:String(err?.message||'未登录')},401);return null;}
  }
  return {
    LOGIN_STORAGE_TIMEOUT_ERROR,
    LOGIN_INVALID_ACCOUNT_ERROR,
    checkLoginRateLimit,
    recordLoginAttempt,
    loadLoginUser,
    verifyLoginPassword,
    authUser,
    mergeStoredAuthUser,
    assertAuthUserActive,
    requireAdminUser,
    requireMatchAdminPermission,
    requireMatchUser,
    ensureMatchUserResponse
  };
}

module.exports={createAuthServices,checkLoginRateLimit,recordLoginAttempt};
