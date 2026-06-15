const TableStore = require('tablestore');

async function handleMatchDiag({res,sendJson,safeDatabaseUrlHost,MATCH_DATABASE_URL,getMatchSqlPool,env=process.env}){
  const startedAt=Date.now();
  const host=safeDatabaseUrlHost(MATCH_DATABASE_URL);
  const result={ts:new Date().toISOString(),matchDatabase:{host:host||'(missing)',ssl:env.MATCH_DATABASE_SSL==='true',urlSet:!!MATCH_DATABASE_URL},test:{status:'pending',ms:0}};
  if(!MATCH_DATABASE_URL){
    result.test={status:'error',error:'MATCH_DATABASE_URL missing',ms:Date.now()-startedAt};
    return sendJson(res,result);
  }
  try{
    await getMatchSqlPool().query('SELECT 1 AS ok');
    result.test={status:'ok',ms:Date.now()-startedAt};
  }catch(e){
    result.test={status:'error',error:String(e?.message||e),ms:Date.now()-startedAt};
  }
  return sendJson(res,result);
}

async function handleTableStoreDiag({res,sendJson,gc,isProductionRuntime,listCampusesWithDefaults,cappedScan,tables,env=process.env}){
  const startedAt=Date.now();
  const {T_CAMPUSES,T_STUDENTS,T_COURTS,T_MEMBERSHIP_ACCOUNTS,T_COACHES,T_PRICE_PLANS}=tables;
  const result={ts:new Date().toISOString(),env:{IS_PRODUCTION_RUNTIME:isProductionRuntime(),NODE_ENV:env.NODE_ENV||'(missing)',TS_ENDPOINT:env.TS_ENDPOINT||'(missing)',TS_INSTANCE:env.TS_INSTANCE||'(missing)',KEY_ID_SET:!!(env.ALIBABA_CLOUD_ACCESS_KEY_ID),KEY_SECRET_SET:!!(env.ALIBABA_CLOUD_ACCESS_KEY_SECRET)},tests:[]};
  try{
    const rows=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('TableStore getRange timeout after 8s')),8000);
      try{
        gc().getRange({tableName:T_CAMPUSES,direction:TableStore.Direction.FORWARD,inclusiveStartPrimaryKey:[{id:TableStore.INF_MIN}],exclusiveEndPrimaryKey:[{id:TableStore.INF_MAX}],maxVersions:1,limit:5},(e,d)=>{
          clearTimeout(timer);
          if(e)return reject(e);
          resolve((d.rows||[]).length);
        });
      }catch(syncErr){clearTimeout(timer);reject(syncErr);}
    });
    result.tests.push({table:T_CAMPUSES,status:'ok',rows,ms:Date.now()-startedAt});
  }catch(e){result.tests.push({table:T_CAMPUSES,status:'error',error:String(e?.message||e),code:e?.code,ms:Date.now()-startedAt});}
  const t2Start=Date.now();
  try{
    const rows2=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('ft_students getRange timeout after 8s')),8000);
      try{
        gc().getRange({tableName:T_STUDENTS,direction:TableStore.Direction.FORWARD,inclusiveStartPrimaryKey:[{id:TableStore.INF_MIN}],exclusiveEndPrimaryKey:[{id:TableStore.INF_MAX}],maxVersions:1,limit:10},(e,d)=>{
          clearTimeout(timer);
          if(e)return reject(e);
          const lastRow=(d.rows||[]).length?(d.rows||[])[(d.rows||[]).length-1]:null;
          resolve({count:(d.rows||[]).length,hasNext:!!(lastRow&&lastRow.primaryKey&&lastRow.primaryKey[0])});
        });
      }catch(syncErr){clearTimeout(timer);reject(syncErr);}
    });
    result.tests.push({table:T_STUDENTS,status:'ok',rows:rows2,ms:Date.now()-t2Start});
    if(rows2.count>0){
      const t3Start=Date.now();
      try{
        const lastId=await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>reject(new Error('first page timeout')),8000);
          gc().getRange({tableName:T_STUDENTS,direction:TableStore.Direction.FORWARD,inclusiveStartPrimaryKey:[{id:TableStore.INF_MIN}],exclusiveEndPrimaryKey:[{id:TableStore.INF_MAX}],maxVersions:1,limit:10},(e,d)=>{
            clearTimeout(timer);
            if(e)return reject(e);
            const last=(d.rows||[])[(d.rows||[]).length-1];
            resolve(last&&last.primaryKey&&last.primaryKey[0]?String(last.primaryKey[0].value):null);
          });
        });
        if(lastId){
          const nextKey=[{id:lastId+'\u0000'}];
          const page2=await new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>reject(new Error('page2 getRange timeout after 8s — pagination is hanging!')),8000);
            gc().getRange({tableName:T_STUDENTS,direction:TableStore.Direction.FORWARD,inclusiveStartPrimaryKey:nextKey,exclusiveEndPrimaryKey:[{id:TableStore.INF_MAX}],maxVersions:1,limit:10},(e,d)=>{
              clearTimeout(timer);
              if(e)return reject(e);
              resolve({count:(d.rows||[]).length,lastId});
            });
          });
          result.tests.push({table:T_STUDENTS+'_page2',status:'ok',rows:page2,ms:Date.now()-t3Start});
        }else{
          result.tests.push({table:T_STUDENTS+'_page2',status:'skipped',reason:'no lastId'});
        }
      }catch(e){result.tests.push({table:T_STUDENTS+'_page2',status:'error',error:String(e?.message||e),ms:Date.now()-t3Start});}
    }
  }catch(e){result.tests.push({table:T_STUDENTS,status:'error',error:String(e?.message||e),code:e?.code,ms:Date.now()-t2Start});}
  result.INF_MIN_type=typeof TableStore.INF_MIN;
  result.INF_MAX_type=typeof TableStore.INF_MAX;
  result.INF_MIN_val=JSON.stringify(TableStore.INF_MIN);
  result.INF_MAX_val=JSON.stringify(TableStore.INF_MAX);
  const t4Start=Date.now();
  try{
    const [campuses,students,courts,membershipAccounts,coaches,pricePlans]=await Promise.race([
      Promise.all([
        listCampusesWithDefaults(),
        cappedScan(T_STUDENTS).catch(e=>{result.cappedScanError='STUDENTS: '+e;return [];}),
        cappedScan(T_COURTS).catch(e=>{result.cappedScanError='COURTS: '+e;return [];}),
        cappedScan(T_MEMBERSHIP_ACCOUNTS).catch(e=>{result.cappedScanError='ACCOUNTS: '+e;return [];}),
        cappedScan(T_COACHES).catch(e=>{result.cappedScanError='COACHES: '+e;return [];}),
        cappedScan(T_PRICE_PLANS).catch(e=>{result.cappedScanError='PRICE: '+e;return [];})
      ]),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('concurrent cappedScan timeout after 8s')),8000))
    ]);
    result.tests.push({name:'concurrent_cappedScan',status:'ok',ms:Date.now()-t4Start,sizes:[campuses.length,students.length,courts.length,membershipAccounts.length,coaches.length,pricePlans.length]});
  }catch(e){
    result.tests.push({name:'concurrent_cappedScan',status:'error',error:String(e?.message||e),ms:Date.now()-t4Start});
  }
  return sendJson(res,result);
}

module.exports={handleMatchDiag,handleTableStoreDiag};
