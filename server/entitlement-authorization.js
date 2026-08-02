function parseArr(v){if(Array.isArray(v))return v;if(typeof v==='string'&&v){try{return JSON.parse(v)}catch{return[]}}return[];}
function dateKey(value){return String(value||'').slice(0,10);}

function activeEntitlementAuthorizationForSchedule(entitlement={},schedule={},authorizations=[]){
  const entitlementId=String(entitlement?.id||schedule?.entitlementId||'').trim();
  const ownerId=String(entitlement?.studentId||schedule?.packageOwnerStudentId||'').trim();
  const studentIds=parseArr(schedule?.studentIds).map(id=>String(id||'').trim()).filter(Boolean);
  const usedBy=String(schedule?.usedByStudentId||schedule?.authorizedStudentId||entitlement?.authorizedStudentId||(studentIds.length===1?studentIds[0]:'')).trim();
  if(!entitlementId||!ownerId||!usedBy||!studentIds.includes(usedBy))return null;
  const usedDate=dateKey(schedule?.startTime);
  return (authorizations||[]).find(row=>{
    if(!row||String(row.status||'active')!=='active')return false;
    if(String(row.entitlementId||'').trim()!==entitlementId)return false;
    if(String(row.ownerStudentId||row.packageOwnerStudentId||'').trim()!==ownerId)return false;
    if(String(row.authorizedStudentId||row.usedByStudentId||'').trim()!==usedBy)return false;
    if(row.validFrom&&usedDate&&usedDate<String(row.validFrom).slice(0,10))return false;
    if(row.validUntil&&usedDate&&usedDate>String(row.validUntil).slice(0,10))return false;
    return true;
  })||null;
}

function entitlementAuthorizedUseContext(entitlement={},schedule={},authorizations=[]){
  const inline=entitlement?.isAuthorizedUse&&entitlement?.authorizationId?entitlement:null;
  if(inline)return {
    authorizationId:inline.authorizationId,
    packageOwnerStudentId:inline.packageOwnerStudentId||inline.ownerStudentId||entitlement.studentId||'',
    packageOwnerStudentName:inline.packageOwnerStudentName||inline.ownerStudentName||'',
    usedByStudentId:inline.authorizedStudentId||inline.usedByStudentId||'',
    usedByStudentName:inline.authorizedStudentName||inline.usedByStudentName||''
  };
  const matched=activeEntitlementAuthorizationForSchedule(entitlement,schedule,authorizations);
  if(!matched)return null;
  return {
    authorizationId:matched.id,
    packageOwnerStudentId:matched.ownerStudentId||entitlement.studentId||'',
    packageOwnerStudentName:matched.ownerStudentName||'',
    usedByStudentId:matched.authorizedStudentId||'',
    usedByStudentName:matched.authorizedStudentName||''
  };
}

function scheduleEntitlementUsageContext(entitlement={},schedule={}){
  const studentIds=parseArr(schedule?.studentIds).filter(Boolean);
  const ownerId=String(entitlement?.studentId||schedule?.packageOwnerStudentId||'').trim();
  const ownerName=String(schedule?.packageOwnerStudentName||entitlement?.studentName||'').trim();
  const authUsedBy=String(schedule?.usedByStudentId||schedule?.authorizedStudentId||'').trim();
  const usedById=authUsedBy||(studentIds.includes(ownerId)?ownerId:(studentIds.length===1?studentIds[0]:ownerId));
  const usedByName=String(schedule?.usedByStudentName||schedule?.authorizedStudentName||(usedById&&usedById!==ownerId?schedule?.studentName:'')||'').trim();
  const isAuthorizedUse=!!(usedById&&ownerId&&usedById!==ownerId);
  return {
    isAuthorizedUse,
    authorizationId:isAuthorizedUse?String(schedule?.authorizationId||'').trim():'',
    packageOwnerStudentId:ownerId,
    packageOwnerStudentName:ownerName,
    usedByStudentId:usedById,
    usedByStudentName:usedByName
  };
}

module.exports={
  activeEntitlementAuthorizationForSchedule,
  entitlementAuthorizedUseContext,
  scheduleEntitlementUsageContext
};
