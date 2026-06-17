const PACKAGE_BOARD_PREFERENCES_ROW_ID='package-board-preferences';
const PACKAGE_BOARD_COLUMN_KEYS=['青少年-私教课','青少年-小班课','成人-私教课','成人-小班课','chaojun','other'];

function normalizePackageBoardColumnOrder(value){
  if(!Array.isArray(value))return [];
  const seen=new Set();
  return value.map(item=>String(item||'').trim()).filter(key=>{
    if(!PACKAGE_BOARD_COLUMN_KEYS.includes(key)||seen.has(key))return false;
    seen.add(key);
    return true;
  });
}

function createPackageBoardRoutes(deps={}){
  const {init,sendJson,get,put,T_MATCH_SETTINGS}=deps;

  async function getPackageBoardPreferences(){
    const row=await get(T_MATCH_SETTINGS,PACKAGE_BOARD_PREFERENCES_ROW_ID).catch(()=>null);
    return {columnOrder:normalizePackageBoardColumnOrder(row?.columnOrder)};
  }

  async function savePackageBoardPreferences(body={},user={}){
    const columnOrder=normalizePackageBoardColumnOrder(body.columnOrder);
    if(!columnOrder.length)throw new Error('请提供列顺序');
    const now=new Date().toISOString();
    const row={id:PACKAGE_BOARD_PREFERENCES_ROW_ID,columnOrder,updatedAt:now,updatedBy:user.name||user.id||''};
    await put(T_MATCH_SETTINGS,PACKAGE_BOARD_PREFERENCES_ROW_ID,row);
    return {columnOrder};
  }

  return async function handlePackageBoardRoutes({path,method,body,user,res}){
    if(path==='/package-board-preferences'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      return sendJson(res,await getPackageBoardPreferences());
    }
    if(path==='/package-board-preferences'&&method==='PUT'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      try{return sendJson(res,await savePackageBoardPreferences(body,user));}
      catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
    }
    return false;
  };
}

module.exports={createPackageBoardRoutes,normalizePackageBoardColumnOrder};
