(function(global){
  const FEATURE_PERMISSION_KEYS=['match_ops','match_finance'];
  const ADMIN_DEFAULT_FEATURE_PERMISSIONS=['match_ops','match_finance'];
  const HIDDEN_MANAGEMENT_PAGES=['operations'];
  function parseClientPermissionList(value){
    if(Array.isArray(value))return value.map(item=>String(item||'').trim()).filter(Boolean);
    return String(value||'').split(/[,，\s]+/).map(item=>item.trim()).filter(Boolean);
  }
  function uniqueClientPermissionList(value){return [...new Set(parseClientPermissionList(value))];}
  function normalizeClientCampusValue(value){
    return typeof global.FlowTennisCampus?.normalizeCampusValue==='function'
      ? global.FlowTennisCampus.normalizeCampusValue(value)
      : String(value||'').trim();
  }
  function normalizeClientRole(role){return String(role||'').trim()==='editor'?'editor':'admin';}
  function normalizeClientDataScope(value,role,campusIds){
    const raw=String(value||'').trim();
    if(['all','campus','coach'].includes(raw))return role==='editor'?'coach':raw;
    if(role==='editor')return 'coach';
    if(campusIds.length)return 'campus';
    return 'all';
  }
  function normalizeClientFeaturePermissions(user){
    const role=normalizeClientRole(user?.role);
    const permissions=new Set([
      ...parseClientPermissionList(user?.featurePermissions),
      ...parseClientPermissionList(user?.permissions),
      ...parseClientPermissionList(user?.matchPermissions)
    ]);
    if(role==='admin')ADMIN_DEFAULT_FEATURE_PERMISSIONS.forEach(item=>permissions.add(item));
    if(user?.matchOps)permissions.add('match_ops');
    if(user?.matchFinance)permissions.add('match_finance');
    return FEATURE_PERMISSION_KEYS.filter(item=>permissions.has(item));
  }
  function normalizeClientPermissionProfile(user){
    const role=normalizeClientRole(user?.role);
    const campusIds=uniqueClientPermissionList(user?.campusIds).map(normalizeClientCampusValue);
    const dataScope=normalizeClientDataScope(user?.dataScope,role,campusIds);
    return {
      role,
      systemType:role==='editor'?'coach':'management',
      dataScope,
      campusIds:dataScope==='campus'?campusIds:[],
      coachId:String(user?.coachId||'').trim(),
      coachName:String(user?.coachName||user?.name||'').trim(),
      featurePermissions:normalizeClientFeaturePermissions({...user,role})
    };
  }
  function clientUserCanAccessCampus(user,campusId){
    const profile=normalizeClientPermissionProfile(user||{});
    if(profile.dataScope==='all')return true;
    if(profile.dataScope!=='campus')return true;
    const value=normalizeClientCampusValue(campusId);
    return !!value&&profile.campusIds.includes(value);
  }
  function clientUserHasFullManagementAccess(user){
    const profile=normalizeClientPermissionProfile(user||{});
    return profile.role==='admin'&&profile.dataScope==='all';
  }
  function clientPageRequiresFullManagementAccess(page){
    return ['finance','operations','weekly-reports','coaches','admin-users','campusmgr'].includes(String(page||'').trim());
  }
  function clientPageIsHiddenManagementView(page){
    return HIDDEN_MANAGEMENT_PAGES.includes(String(page||'').trim());
  }
  function clientUserCanOpenManagementPage(user,page){
    return !clientPageIsHiddenManagementView(page)&&(!clientPageRequiresFullManagementAccess(page)||clientUserHasFullManagementAccess(user));
  }
  global.normalizeClientPermissionProfile=normalizeClientPermissionProfile;
  global.clientUserCanAccessCampus=clientUserCanAccessCampus;
  global.clientUserHasFullManagementAccess=clientUserHasFullManagementAccess;
  global.clientPageRequiresFullManagementAccess=clientPageRequiresFullManagementAccess;
  global.clientPageIsHiddenManagementView=clientPageIsHiddenManagementView;
  global.clientUserCanOpenManagementPage=clientUserCanOpenManagementPage;
})(typeof window!=='undefined'?window:globalThis);
