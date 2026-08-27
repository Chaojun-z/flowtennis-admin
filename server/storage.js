const TableStore = require('tablestore');

function createStorageServices({
  tableStoreConfig = {},
  hotScanTables = new Map(),
  hotGetTables = new Map(),
  productionPageReadLimits = {},
  isProductionRuntime = () => false,
  onTableWrite = () => {}
} = {}) {
  const {
    accessKeyId,
    secretAccessKey,
    endpoint,
    instanceName
  } = tableStoreConfig;

  const hotScanCache = new Map();
  const hotScanLoadPromises = new Map();
  const hotGetCache = new Map();
  let tsClient;
  const STORAGE_OPERATION_TIMEOUT_MS = Math.max(1000, parseInt(process.env.STORAGE_OPERATION_TIMEOUT_MS || '10000', 10) || 10000);

  function gc(){if(!tsClient)tsClient=new TableStore.Client({accessKeyId,secretAccessKey,endpoint,instancename:instanceName,maxRetries:3,httpOptions:{timeout:15000}});return tsClient;}
  function isTransientStorageError(err){
    const msg=String(err?.message||err||'');
    return /Client network socket disconnected before secure TLS connection was established|ECONNRESET|ETIMEDOUT|socket hang up|EAI_AGAIN|\[storage-timeout\]/i.test(msg);
  }
  function formatStorageMeta(meta={}){
    return Object.entries(meta)
      .filter(([,value])=>value!==undefined&&value!==null&&value!=='')
      .map(([key,value])=>`${key}=${String(value)}`)
      .join(' ');
  }
  function summarizeStorageError(err){
    const parts=[
      err?.code?`code=${err.code}`:'',
      err?.name?`name=${err.name}`:'',
      err?.message?`message=${String(err.message).slice(0,220)}`:String(err||'').slice(0,220)
    ].filter(Boolean);
    return parts.join(' ');
  }
  function createStorageTimeoutError(op,meta,startedAt){
    const detail=formatStorageMeta(meta);
    const err=new Error(`[storage-timeout] op=${op} ${detail} timed out after ${Date.now()-startedAt}ms`);
    err.code='STORAGE_TIMEOUT';
    return err;
  }
  function runStorageOperation(op,meta,executor){
    return new Promise((res,rej)=>{
      let settled=false;
      const startedAt=Date.now();
      const detail=formatStorageMeta(meta);
      const timer=setTimeout(()=>{
        if(settled)return;
        settled=true;
        const err=createStorageTimeoutError(op,meta,startedAt);
        console.error(err.message);
        rej(err);
      },STORAGE_OPERATION_TIMEOUT_MS);
      const resolveOnce=(value)=>{
        if(settled)return;
        settled=true;
        clearTimeout(timer);
        res(value);
      };
      const rejectOnce=(err)=>{
        if(settled)return;
        settled=true;
        clearTimeout(timer);
        console.error(`[storage-error] op=${op} ${detail} ${summarizeStorageError(err)}`);
        rej(err);
      };
      try{
        executor(resolveOnce,rejectOnce);
      }catch(err){
        rejectOnce(err);
      }
    });
  }
  async function withStorageRetry(fn,maxAttempts=2){
    let lastErr;
    for(let attempt=1;attempt<=maxAttempts;attempt++){
      try{return await fn();}
      catch(err){
        lastErr=err;
        console.warn(`[storage-retry] attempt ${attempt}/${maxAttempts} ${summarizeStorageError(err)}`);
        if(!isTransientStorageError(err)||attempt===maxAttempts)throw err;
        await new Promise(res=>setTimeout(res,attempt*200));
      }
    }
    throw lastErr;
  }
  function cloneCacheValue(value){return JSON.parse(JSON.stringify(value));}
  function normalizeScanColumns(columns=[]){
    return [...new Set((columns||[]).map(item=>String(item||'').trim()).filter(Boolean))];
  }
  function scanLatestRowsDesc(t,{limit=200,columns=[]}={}){
    const normalizedLimit=Math.max(1,Math.min(parseInt(limit,10)||200,2000));
    const normalizedColumns=normalizeScanColumns(columns);
    return withStorageRetry(()=>runStorageOperation('getRangeLatest',{table:t,limit:normalizedLimit},(res,rej)=>{
      gc().getRange({
        tableName:t,
        direction:TableStore.Direction.BACKWARD,
        inclusiveStartPrimaryKey:[{id:TableStore.INF_MAX}],
        exclusiveEndPrimaryKey:[{id:TableStore.INF_MIN}],
        maxVersions:1,
        limit:normalizedLimit,
        ...(normalizedColumns.length?{columnsToGet:normalizedColumns}:{})
      },(e,d)=>{
        if(e)return rej(e);
        const rows=(d.rows||[]).map(r=>{
          if(!r.primaryKey)return null;
          const obj={id:r.primaryKey[0].value};
          (r.attributes||[]).forEach(a=>{
            try{obj[a.columnName]=JSON.parse(a.columnValue);}catch{obj[a.columnName]=a.columnValue;}
          });
          return obj;
        }).filter(Boolean);
        res(rows);
      });
    }));
  }
  function invalidateHotScanCache(t){
    const prefix=`${t}:`;
    for(const key of hotScanCache.keys())if(key.startsWith(prefix))hotScanCache.delete(key);
  }
  function normalizeScanPageLimit(value){
    return Math.max(1,Math.min(parseInt(value,10)||500,500));
  }
  function hotScanCacheKey(t,columns,pageLimit){
    const projection=Array.isArray(columns)&&columns.length?columns.map(String).join('\u0001'):'*';
    return `${t}:${projection}:${normalizeScanPageLimit(pageLimit)}`;
  }
  function normalizeProjectionColumns(columns){
    if(!Array.isArray(columns))return [];
    return [...new Set(columns.map(item=>String(item||'').trim()).filter(Boolean))];
  }
  function hotGetCacheKey(t,id){return `${t}:${String(id)}`;}
  function invalidateHotGetCache(t,id){
    if(id===undefined||id===null){
      for(const key of hotGetCache.keys())if(key.startsWith(`${t}:`))hotGetCache.delete(key);
      return;
    }
    hotGetCache.delete(hotGetCacheKey(t,id));
  }
  async function getCachedScan(t,options={}){
    const cfg=hotScanTables.get(t);
    const columns=normalizeProjectionColumns(options?.columns);
    const pageLimit=normalizeScanPageLimit(options?.pageLimit);
    const fresh=options?.fresh===true||options?.forceFresh===true;
    if(!cfg)return scan(t,{columns});
    const now=Date.now();
    const cacheKey=hotScanCacheKey(t,columns,pageLimit);
    const cached=hotScanCache.get(cacheKey);
    if(cached&&!fresh&&cached.expiresAt>now)return cloneCacheValue(cached.rows);
    if(!fresh&&hotScanLoadPromises.has(cacheKey))return cloneCacheValue(await hotScanLoadPromises.get(cacheKey));
    const loadPromise=scan(t,{columns,pageLimit}).then(rows=>{
      hotScanCache.set(cacheKey,{rows:cloneCacheValue(rows),expiresAt:Date.now()+cfg.ttlMs});
      return rows;
    }).finally(()=>hotScanLoadPromises.delete(cacheKey));
    if(!fresh)hotScanLoadPromises.set(cacheKey,loadPromise);
    return cloneCacheValue(await loadPromise);
  }
  function productionReadTruncatedError(t,limit){
    const err=new Error(`生产读取被截断：${t} 超过 ${limit} 条，请改专用读模型或提高读取上限`);
    err.code='PRODUCTION_READ_TRUNCATED';
    return err;
  }
  function scanFirstRows(t, {limit=200, columns=[],detectOverflow=false}={}) {
    const normalizedLimit=Math.max(1,Math.min(parseInt(limit,10)||200,2000));
    const requestLimit=detectOverflow?normalizedLimit+1:normalizedLimit;
    const normalizedColumns=normalizeScanColumns(columns);
    return withStorageRetry(()=>new Promise((res,rej)=>{
      const rows=[];
      function f(sk){
        const remaining=requestLimit-rows.length;
        if(remaining<=0){
          if(detectOverflow&&rows.length>normalizedLimit)return rej(productionReadTruncatedError(t,normalizedLimit));
          return res(rows);
        }
        runStorageOperation('getRangeScanFirst',{table:t},(opRes,opRej)=>{
          gc().getRange({
            tableName:t,
            direction:TableStore.Direction.FORWARD,
            inclusiveStartPrimaryKey:sk||[{id:TableStore.INF_MIN}],
            exclusiveEndPrimaryKey:[{id:TableStore.INF_MAX}],
            maxVersions:1,
            limit:remaining,
            ...(normalizedColumns.length?{columnsToGet:normalizedColumns}:{})
          },(e,d)=>{
            if(e)return opRej(e);
            opRes(d);
          });
        }).then(d=>{
          (d.rows||[]).forEach(r=>{
            if(!r.primaryKey)return;
            const obj={id:r.primaryKey[0].value};
            (r.attributes||[]).forEach(a=>{
              try{obj[a.columnName]=JSON.parse(a.columnValue);}catch{obj[a.columnName]=a.columnValue;}
            });
            rows.push(obj);
          });
          if(detectOverflow&&rows.length>normalizedLimit)return rej(productionReadTruncatedError(t,normalizedLimit));
          const nextStartPrimaryKey=d.nextStartPrimaryKey ? d.nextStartPrimaryKey.map(pk => ({ [pk.name]: pk.value })) : null;
          nextStartPrimaryKey&&rows.length<requestLimit?f(nextStartPrimaryKey):res(rows);
        }).catch(rej);
      }
      f();
    }));
  }
  function cappedScan(t, limit=productionPageReadLimits.default){
    const normalizedLimit=limit===undefined?productionPageReadLimits.default:(productionPageReadLimits[t]||limit);
    return isProductionRuntime() ? scanFirstRows(t,{limit:normalizedLimit,detectOverflow:true}).catch((e)=>{console.error('cappedScan err:',e);throw e;}) : getCachedScan(t).catch(()=>[]);
  }
  async function getCachedRow(t,id){
    const cfg=hotGetTables.get(t);
    if(!cfg)return get(t,id);
    const now=Date.now();
    const key=hotGetCacheKey(t,id);
    const cached=hotGetCache.get(key);
    if(cached&&cached.expiresAt>now)return cloneCacheValue(cached.row);
    const row=await get(t,id);
    hotGetCache.set(key,{row:cloneCacheValue(row),expiresAt:now+cfg.ttlMs});
    return row;
  }
  async function put(t,id,attrs){
    const result=await withStorageRetry(()=>runStorageOperation('putRow',{table:t,id},(res,rej)=>{gc().putRow({tableName:t,condition:new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE,null),primaryKey:[{id:String(id)}],attributeColumns:Object.entries(attrs).filter(([k])=>k!=='id').map(([k,v])=>({[k]:typeof v==='object'?JSON.stringify(v):String(v??'')}))},( e,d)=>e?rej(e):res(d));}));
    if(hotScanTables.has(t))invalidateHotScanCache(t);
    if(hotGetTables.has(t))invalidateHotGetCache(t,id);
    await Promise.resolve(onTableWrite(t,{op:'put',id,attrs}));
    return result;
  }
  function putIfAbsent(t,id,attrs){return withStorageRetry(()=>runStorageOperation('putRowIfAbsent',{table:t,id},(res,rej)=>{gc().putRow({tableName:t,condition:new TableStore.Condition(TableStore.RowExistenceExpectation.EXPECT_NOT_EXIST,null),primaryKey:[{id:String(id)}],attributeColumns:Object.entries(attrs).filter(([k])=>k!=='id').map(([k,v])=>({[k]:typeof v==='object'?JSON.stringify(v):String(v??'')}))},( e,d)=>e?rej(e):res(d));}));}
  function get(t,id){return withStorageRetry(()=>runStorageOperation('getRow',{table:t,id},(res,rej)=>{gc().getRow({tableName:t,primaryKey:[{id:String(id)}],maxVersions:1},(e,d)=>{if(e)return rej(e);if(!d.row||!d.row.primaryKey)return res(null);const obj={id:d.row.primaryKey[0].value};(d.row.attributes||[]).forEach(a=>{try{obj[a.columnName]=JSON.parse(a.columnValue);}catch{obj[a.columnName]=a.columnValue;}});res(obj);});}));}
  function scan(t,options={}){
    return withStorageRetry(()=>new Promise((res,rej)=>{
      const rows=[];
      const columns=normalizeProjectionColumns(options?.columns);
      const columnsToGet=columns.length?columns:undefined;
      const pageLimit=normalizeScanPageLimit(options?.pageLimit);
      function f(sk){
        runStorageOperation('getRangePage',{table:t},(opRes,opRej)=>{
          const request={
            tableName:t,
            direction:TableStore.Direction.FORWARD,
            inclusiveStartPrimaryKey:sk||[{id:TableStore.INF_MIN}],
            exclusiveEndPrimaryKey:[{id:TableStore.INF_MAX}],
            maxVersions:1,
            limit:pageLimit
          };
          if(columnsToGet)request.columnsToGet=columnsToGet;
          gc().getRange(request,(e,d)=>{
            if(e)return opRej(e);
            opRes(d);
          });
        }).then(d=>{
          (d.rows||[]).forEach(r=>{
            if(!r.primaryKey)return;
            const obj={id:r.primaryKey[0].value};
            (r.attributes||[]).forEach(a=>{try{obj[a.columnName]=JSON.parse(a.columnValue);}catch{obj[a.columnName]=a.columnValue;}});
            rows.push(obj);
          });
          const nextStartPrimaryKey=d.nextStartPrimaryKey ? d.nextStartPrimaryKey.map(pk => ({ [pk.name]: pk.value })) : null;
          nextStartPrimaryKey?f(nextStartPrimaryKey):res(rows);
        }).catch(rej);
      }
      f();
    }));
  }
  function scanByIdPrefix(t,prefix,options={}){
    const rawPrefix=String(prefix||'');
    const columns=normalizeProjectionColumns(options?.columns);
    return withStorageRetry(()=>new Promise((res,rej)=>{
      const rows=[];
      const columnsToGet=columns.length?columns:undefined;
      function f(sk){
        runStorageOperation('getRangePrefix',{table:t,prefix:rawPrefix},(opRes,opRej)=>{
          const request={
            tableName:t,
            direction:TableStore.Direction.FORWARD,
            inclusiveStartPrimaryKey:sk||[{id:rawPrefix}],
            exclusiveEndPrimaryKey:[{id:`${rawPrefix}\uffff`}],
            maxVersions:1,
            limit:500
          };
          if(columnsToGet)request.columnsToGet=columnsToGet;
          gc().getRange(request,(e,d)=>{
            if(e)return opRej(e);
            opRes(d);
          });
        }).then(d=>{
          (d.rows||[]).forEach(r=>{
            if(!r.primaryKey)return;
            const obj={id:r.primaryKey[0].value};
            (r.attributes||[]).forEach(a=>{try{obj[a.columnName]=JSON.parse(a.columnValue);}catch{obj[a.columnName]=a.columnValue;}});
            rows.push(obj);
          });
          const nextStartPrimaryKey=d.nextStartPrimaryKey ? d.nextStartPrimaryKey.map(pk => ({ [pk.name]: pk.value })) : null;
          nextStartPrimaryKey?f(nextStartPrimaryKey):res(rows);
        }).catch(rej);
      }
      f();
    }));
  }
  async function del(t,id){
    const result=await withStorageRetry(()=>runStorageOperation('deleteRow',{table:t,id},(res,rej)=>{gc().deleteRow({tableName:t,condition:new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE,null),primaryKey:[{id:String(id)}]},(e,d)=>e?rej(e):res(d));}));
    if(hotScanTables.has(t))invalidateHotScanCache(t);
    if(hotGetTables.has(t))invalidateHotGetCache(t,id);
    await Promise.resolve(onTableWrite(t,{op:'delete',id}));
    return result;
  }
  async function clearTables(storage,tables){
    const result={success:true,total:0,tables:[]};
    for(const table of tables){
      try{
        const rows=await storage.scan(table);
        for(const row of rows)await storage.del(table,row.id);
        result.total+=rows.length;
        result.tables.push({table,count:rows.length});
      }catch(err){
        result.success=false;
        result.tables.push({table,count:0,error:String(err?.message||err)});
      }
    }
    return result;
  }
  function mkTable(t){return runStorageOperation('createTable',{table:t},(res)=>{gc().createTable({tableMeta:{tableName:t,primaryKey:[{name:'id',type:TableStore.PrimaryKeyType.STRING}]},reservedThroughput:{capacityUnit:{read:0,write:0}},tableOptions:{timeToLive:-1,maxVersions:1}},e=>res(e?'exists':'ok'));});}
  function withTimeout(promise,ms,fallback){
    return Promise.race([promise,new Promise((res)=>setTimeout(()=>res(fallback),ms))]);
  }
  async function withRequiredStorageTimeout(promise,ms,message){
    const timeoutMarker={__storageTimeout:true};
    const result=await withTimeout(Promise.resolve(promise),ms,timeoutMarker);
    if(result===timeoutMarker)throw new Error(message);
    return result;
  }

  return {
    gc,
    isTransientStorageError,
    scanLatestRowsDesc,
    invalidateHotScanCache,
    getCachedScan,
    productionReadTruncatedError,
    scanFirstRows,
    cappedScan,
    getCachedRow,
    put,
    putIfAbsent,
    get,
    scan,
    scanByIdPrefix,
    del,
    clearTables,
    mkTable,
    withTimeout,
    withRequiredStorageTimeout,
    cloneCacheValue
  };
}

module.exports = { createStorageServices };
