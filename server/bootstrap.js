function readBooleanEnv(env,name){return String(env?.[name]||'').trim().toLowerCase()==='true';}
function resolveRuntimeStage(env=process.env){
  const vercelEnv=String(env?.VERCEL_ENV||'').trim().toLowerCase();
  if(vercelEnv)return vercelEnv;
  const nodeEnv=String(env?.NODE_ENV||'').trim().toLowerCase();
  return nodeEnv||'development';
}
function buildBootstrapSafetyFlags(env=process.env){
  const runtimeStage=resolveRuntimeStage(env);
  const isProduction=runtimeStage==='production';
  const allowProductionBootstrapWrites=readBooleanEnv(env,'ALLOW_PRODUCTION_BOOTSTRAP_WRITES');
  const allowHighRiskBootstrapWrites=!isProduction||allowProductionBootstrapWrites;
  return {
    runtimeStage,
    isProduction,
    allowProductionBootstrapWrites,
    enableDefaultUserBootstrap:readBooleanEnv(env,'ENABLE_DEFAULT_USER_BOOTSTRAP')&&allowHighRiskBootstrapWrites,
    enableTableBootstrap:readBooleanEnv(env,'ENABLE_TABLE_BOOTSTRAP')&&allowHighRiskBootstrapWrites,
    enableRuntimeTableEnsure:readBooleanEnv(env,'ENABLE_RUNTIME_TABLE_ENSURE'),
    enableDefaultPricePlanBootstrap:readBooleanEnv(env,'ENABLE_DEFAULT_PRICE_PLAN_BOOTSTRAP')&&allowHighRiskBootstrapWrites,
    enableShunyiMapoFinanceSeedBootstrap:readBooleanEnv(env,'ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP')&&allowHighRiskBootstrapWrites,
    enableImportedLedgerAutoRepair:readBooleanEnv(env,'ENABLE_IMPORTED_LEDGER_AUTO_REPAIR')&&allowHighRiskBootstrapWrites
  };
}
function logBlockedAutoWrite(action){
  console.warn(`[api-guard] ${action} skipped in production. 如需执行，请仅在获批运维修复场景下显式设置 ALLOW_PRODUCTION_BOOTSTRAP_WRITES=true。`);
}

const DEFAULT_COACH_USERS=['baiyangj','chendand','yuekez','zhoux','sunmingy'];
const DEFAULT_CAMPUSES=[
  {id:'shunyi_mapo',name:'顺义马坡',code:'shunyi_mapo'},
  {id:'shilipu',name:'朝阳十里堡',code:'shilipu'},
  {id:'guowang',name:'朝阳国网',code:'guowang'},
  {id:'langang',name:'朝阳蓝色港湾',code:'langang'},
  {id:'chaojun',name:'朝珺私教',code:'chaojun'}
];

function createBootstrapRuntime(options={}){
  const env=options.env||process.env;
  const bcrypt=options.bcrypt;
  const requiredEnvVars=options.requiredEnvVars||[];
  const defaultAdminBootstrapPassword=options.defaultAdminBootstrapPassword||'';
  const bootstrapSafetyFlags=options.bootstrapSafetyFlags||buildBootstrapSafetyFlags(env);
  const rawFlags=options.rawFlags||{};
  const tables=options.tables||{};
  const runtimeEnsuredTables=options.runtimeEnsuredTables||[];
  const storage=options.storage||{};
  const seedHelpers=options.seedHelpers||{};
  const shunyi_mapoFinanceSeed=options.shunyi_mapoFinanceSeed||{};
  const syncDefaultPricePlans=options.syncDefaultPricePlans||async function syncDefaultPricePlans(){};
  const prewarmHotScanCache=options.prewarmHotScanCache||async function prewarmHotScanCache(){};
  const isProductionRuntime=options.isProductionRuntime||(()=>bootstrapSafetyFlags.runtimeStage==='production');
  const blockedLogger=options.logBlockedAutoWrite||logBlockedAutoWrite;
  const {
    get,
    put,
    del,
    scan,
    mkTable
  }=storage;
  const {
    importedLedgerMonthKey,
    isShunyiMapoFinanceSeedRow,
    isImportedMonthlyLedgerRow,
    collectDuplicateImportedLedgerIds
  }=seedHelpers;
  const enableDefaultUserBootstrap=bootstrapSafetyFlags.enableDefaultUserBootstrap;
  const enableTableBootstrap=bootstrapSafetyFlags.enableTableBootstrap;
  const enableRuntimeTableEnsure=bootstrapSafetyFlags.enableRuntimeTableEnsure;
  const enableDefaultPricePlanBootstrap=bootstrapSafetyFlags.enableDefaultPricePlanBootstrap;
  const enableShunyiMapoFinanceSeedBootstrap=bootstrapSafetyFlags.enableShunyiMapoFinanceSeedBootstrap;
  const enableImportedLedgerAutoRepair=bootstrapSafetyFlags.enableImportedLedgerAutoRepair;
  const isProduction=bootstrapSafetyFlags.isProduction;
  const isProductionRuntimeValue=isProductionRuntime();
  let inited=false;
  let initPromise=null;
  let importedLedgerRepairChecked=false;

  function getRuntimeEnsuredTables(){return [...runtimeEnsuredTables];}
  function getDefaultCampuses(){return DEFAULT_CAMPUSES.map(campus=>({...campus}));}

  async function bootstrapDefaultUsers(){
    if(!enableDefaultUserBootstrap)return;
    if(!defaultAdminBootstrapPassword)throw new Error('ENABLE_DEFAULT_USER_BOOTSTRAP=true 时必须配置 DEFAULT_ADMIN_BOOTSTRAP_PASSWORD');
    const us=[{id:'admin',name:'管理员',role:'admin',username:'admin'},{id:'baiyangj',name:'白杨静',role:'editor',username:'baiyangj'},{id:'chendand',name:'陈丹丹',role:'editor',username:'chendand'},{id:'yuekez',name:'岳克舟',role:'editor',username:'yuekez'},{id:'zhoux',name:'周欣',role:'editor',username:'zhoux'},{id:'sunmingy',name:'孙明玥',role:'editor',username:'sunmingy'}];
    const h=await bcrypt.hash(defaultAdminBootstrapPassword,10);
    for(const u of us){
      const ex=await get(tables.T_USERS,u.id).catch(()=>null);
      if(!ex)await put(tables.T_USERS,u.id,{...u,password:h,createdAt:new Date().toISOString()});
    }
  }
  async function ensureCoachBindings(){
    for(const id of DEFAULT_COACH_USERS){
      const u=await get(tables.T_USERS,id).catch(()=>null);
      if(!u)continue;
      if(u.role==='editor'&&(!u.coachName||!String(u.coachName).trim())){
        await put(tables.T_USERS,id,{...u,coachName:u.name||id,coachId:u.coachId||id,updatedAt:new Date().toISOString()});
      }
    }
  }
  async function ensureDefaultCampuses(){
    await mkTable(tables.T_CAMPUSES);
    for(const campus of DEFAULT_CAMPUSES){
      const ex=await get(tables.T_CAMPUSES,campus.id).catch(()=>null);
      if(!ex)await put(tables.T_CAMPUSES,campus.id,{...campus,createdAt:new Date().toISOString()});
    }
  }
  async function putSeedRows(table,rows=[]){
    const chunkSize=20;
    for(let i=0;i<rows.length;i+=chunkSize){
      await Promise.all(rows.slice(i,i+chunkSize).map(row=>put(table,row.id,row)));
    }
  }
  function collectShunyiMapoSeedStaleRowIds(existingRows=[],seedRows=[],tag=''){
    const nextIds=new Set((seedRows||[]).map(row=>row.id));
    return (existingRows||[])
      .filter(row=>isShunyiMapoFinanceSeedRow(row)&&(!nextIds.has(row.id)||String(row.seedTag||'')!==String(tag||'')))
      .map(row=>row.id);
  }
  function collectShunyiMapoSeedImportedLedgerReplacementIds(existingRows=[],seedRows=[]){
    const seedKeys=new Set((seedRows||[]).map(row=>{
      const monthKey=importedLedgerMonthKey(row);
      if(!monthKey)return '';
      return [row.entitlementId,row.purchaseId,row.studentId,monthKey].join('|');
    }).filter(Boolean));
    if(!seedKeys.size)return [];
    return (existingRows||[])
      .filter(row=>!isShunyiMapoFinanceSeedRow(row)&&isImportedMonthlyLedgerRow(row))
      .filter(row=>seedKeys.has([row.entitlementId,row.purchaseId,row.studentId,importedLedgerMonthKey(row)].join('|')))
      .map(row=>row.id);
  }
  async function deleteSeedRows(table,ids=[]){
    const chunkSize=20;
    for(let i=0;i<ids.length;i+=chunkSize){
      await Promise.all(ids.slice(i,i+chunkSize).map(id=>del(table,id).catch(()=>null)));
    }
  }
  async function replaceShunyiMapoSeedRows(table,seedRows=[],tag=''){
    const staleIds=collectShunyiMapoSeedStaleRowIds(await scan(table).catch(()=>[]),seedRows,tag);
    if(staleIds.length)await deleteSeedRows(table,staleIds);
    await putSeedRows(table,seedRows);
  }
  async function replaceShunyiMapoSeedLedgerRows(seedRows=[],tag=''){
    const existingRows=await scan(tables.T_ENTITLEMENT_LEDGER).catch(()=>[]);
    const staleIds=collectShunyiMapoSeedStaleRowIds(existingRows,seedRows,tag);
    const replacementIds=collectShunyiMapoSeedImportedLedgerReplacementIds(existingRows,seedRows);
    const duplicateIds=collectDuplicateImportedLedgerIds(existingRows);
    const removeIds=[...new Set([...staleIds,...replacementIds,...duplicateIds])];
    if(removeIds.length)await deleteSeedRows(tables.T_ENTITLEMENT_LEDGER,removeIds);
    await putSeedRows(tables.T_ENTITLEMENT_LEDGER,seedRows);
  }
  async function repairImportedLedgerDuplicates(){
    if(!enableImportedLedgerAutoRepair){
      if(rawFlags.enableImportedLedgerAutoRepair&&isProduction&&!bootstrapSafetyFlags.allowProductionBootstrapWrites)blockedLogger('repairImportedLedgerDuplicates');
      return 0;
    }
    const existingRows=await scan(tables.T_ENTITLEMENT_LEDGER).catch(()=>[]);
    const duplicateIds=collectDuplicateImportedLedgerIds(existingRows);
    if(!duplicateIds.length)return 0;
    await deleteSeedRows(tables.T_ENTITLEMENT_LEDGER,duplicateIds);
    return duplicateIds.length;
  }
  async function maybeRepairImportedLedgerDuplicates(){
    if(importedLedgerRepairChecked)return 0;
    importedLedgerRepairChecked=true;
    try{
      return await repairImportedLedgerDuplicates();
    }catch(err){
      importedLedgerRepairChecked=false;
      throw err;
    }
  }
  function hasCurrentShunyiMapoSeedRows(existingRows=[],seedRows=[],tag=''){
    const seedIds=new Set((seedRows||[]).map(row=>row.id));
    const existingSeedRows=(existingRows||[]).filter(isShunyiMapoFinanceSeedRow);
    return existingSeedRows.length===seedRows.length&&existingSeedRows.every(row=>seedIds.has(row.id)&&String(row.seedTag||'')===String(tag||''));
  }
  async function isShunyiMapoFinanceSeedCurrent(){
    const tag=shunyi_mapoFinanceSeed?.meta?.tag;
    if(!tag)return false;
    const [purchases,entitlements,ledger]=await Promise.all([
      scan(tables.T_PURCHASES).catch(()=>[]),
      scan(tables.T_ENTITLEMENTS).catch(()=>[]),
      scan(tables.T_ENTITLEMENT_LEDGER).catch(()=>[])
    ]);
    if(!hasCurrentShunyiMapoSeedRows(purchases,shunyi_mapoFinanceSeed.purchases,tag))return false;
    if(!hasCurrentShunyiMapoSeedRows(entitlements,shunyi_mapoFinanceSeed.entitlements,tag))return false;
    if(!hasCurrentShunyiMapoSeedRows(ledger,shunyi_mapoFinanceSeed.entitlementLedger,tag))return false;
    if(collectShunyiMapoSeedImportedLedgerReplacementIds(ledger,shunyi_mapoFinanceSeed.entitlementLedger).length)return false;
    for(const id of shunyi_mapoFinanceSeed?.meta?.deletePurchases||[]){
      const old=await get(tables.T_PURCHASES,id).catch(()=>null);
      if(old)return false;
    }
    return true;
  }
  async function bootstrapShunyiMapoFinanceSeed(){
    if(!enableShunyiMapoFinanceSeedBootstrap){
      if(rawFlags.enableShunyiMapoFinanceSeedBootstrap&&isProduction&&!bootstrapSafetyFlags.allowProductionBootstrapWrites)blockedLogger('bootstrapShunyiMapoFinanceSeed');
      return;
    }
    if(await isShunyiMapoFinanceSeedCurrent())return;
    const tag=shunyi_mapoFinanceSeed?.meta?.tag||'';
    await deleteSeedRows(tables.T_PURCHASES,shunyi_mapoFinanceSeed?.meta?.deletePurchases||[]);
    await deleteSeedRows(tables.T_PACKAGES,shunyi_mapoFinanceSeed?.meta?.deletePackages||[]);
    await replaceShunyiMapoSeedRows(tables.T_STUDENTS,shunyi_mapoFinanceSeed.students,tag);
    await replaceShunyiMapoSeedRows(tables.T_PRODUCTS,shunyi_mapoFinanceSeed.products,tag);
    await replaceShunyiMapoSeedRows(tables.T_PACKAGES,shunyi_mapoFinanceSeed.packages,tag);
    await replaceShunyiMapoSeedRows(tables.T_PURCHASES,shunyi_mapoFinanceSeed.purchases,tag);
    await replaceShunyiMapoSeedRows(tables.T_ENTITLEMENTS,shunyi_mapoFinanceSeed.entitlements,tag);
    await replaceShunyiMapoSeedLedgerRows(shunyi_mapoFinanceSeed.entitlementLedger,tag);
  }
  function scheduleInitInBackground(){
    if(requiredEnvVars.some((k)=>!env[k]))return;
    if(isProductionRuntimeValue)return;
    if(inited||initPromise)return;
    init().catch(err=>console.error('[api-init] background init failed',err));
  }
  async function init(){
    if(inited)return;
    if(initPromise)return initPromise;
    initPromise=(async()=>{
      const startedAt=Date.now();
      const missing=requiredEnvVars.filter((k)=>!env[k]);
      if(missing.length)throw new Error('缺少环境变量：'+missing.join(', '));
      if(rawFlags.enableDefaultUserBootstrap&&!enableDefaultUserBootstrap&&isProduction)blockedLogger('bootstrapDefaultUsers');
      if(rawFlags.enableTableBootstrap&&!enableTableBootstrap&&isProduction)blockedLogger('ENABLE_TABLE_BOOTSTRAP');
      if(rawFlags.enableDefaultPricePlanBootstrap&&!enableDefaultPricePlanBootstrap&&isProduction)blockedLogger('syncDefaultPricePlans');
      if(rawFlags.enableShunyiMapoFinanceSeedBootstrap&&!enableShunyiMapoFinanceSeedBootstrap&&isProduction)blockedLogger('bootstrapShunyiMapoFinanceSeed');
      if(rawFlags.enableImportedLedgerAutoRepair&&!enableImportedLedgerAutoRepair&&isProduction)blockedLogger('repairImportedLedgerDuplicates');
      if(isProductionRuntimeValue){
        inited=true;
        console.log(`[api-init] production request-ready without heavy bootstrap ${Date.now()-startedAt}ms`);
        return;
      }
      if(enableRuntimeTableEnsure||enableTableBootstrap){
        const stepStartedAt=Date.now();
        for(const t of runtimeEnsuredTables)await mkTable(t);
        console.log(`[api-init] ensure runtime tables done ${Date.now()-stepStartedAt}ms (total ${Date.now()-startedAt}ms)`);
      }
      if(enableShunyiMapoFinanceSeedBootstrap){
        const stepStartedAt=Date.now();
        for(const t of [tables.T_STUDENTS,tables.T_PRODUCTS,tables.T_PACKAGES,tables.T_PURCHASES,tables.T_ENTITLEMENTS,tables.T_ENTITLEMENT_LEDGER])await mkTable(t);
        console.log(`[api-init] ensure shunyi_mapo seed tables done ${Date.now()-stepStartedAt}ms (total ${Date.now()-startedAt}ms)`);
      }
      if(enableTableBootstrap){
        let stepStartedAt=Date.now();
        for(const t of[tables.T_USERS,tables.T_COURTS,tables.T_STUDENTS,tables.T_PRODUCTS,tables.T_PLANS,tables.T_SCHEDULE,tables.T_SCHEDULE_CONFLICT_INDEX,tables.T_COACHES,tables.T_CLASSES,tables.T_CLASS_NOS,tables.T_CAMPUSES,tables.T_FEEDBACKS,tables.T_COACH_PROPOSALS,tables.T_PACKAGES,tables.T_PURCHASES,tables.T_ENTITLEMENTS,tables.T_ENTITLEMENT_LEDGER,tables.T_PRICE_PLANS].filter(Boolean))await mkTable(t);
        console.log(`[api-init] ensure bootstrap tables done ${Date.now()-stepStartedAt}ms (total ${Date.now()-startedAt}ms)`);
        stepStartedAt=Date.now();
        await bootstrapDefaultUsers();
        console.log(`[api-init] bootstrapDefaultUsers done ${Date.now()-stepStartedAt}ms (total ${Date.now()-startedAt}ms)`);
        stepStartedAt=Date.now();
        await ensureDefaultCampuses();
        console.log(`[api-init] ensureDefaultCampuses done ${Date.now()-stepStartedAt}ms (total ${Date.now()-startedAt}ms)`);
        stepStartedAt=Date.now();
        await ensureCoachBindings();
        console.log(`[api-init] ensureCoachBindings done ${Date.now()-stepStartedAt}ms (total ${Date.now()-startedAt}ms)`);
      }
      if(enableShunyiMapoFinanceSeedBootstrap){
        const stepStartedAt=Date.now();
        await bootstrapShunyiMapoFinanceSeed();
        console.log(`[api-init] bootstrapShunyiMapoFinanceSeed done ${Date.now()-stepStartedAt}ms (total ${Date.now()-startedAt}ms)`);
      }
      if(enableImportedLedgerAutoRepair){
        const stepStartedAt=Date.now();
        const repairedCount=await repairImportedLedgerDuplicates();
        console.log(`[api-init] repairImportedLedgerDuplicates done ${Date.now()-stepStartedAt}ms, removed ${repairedCount} rows (total ${Date.now()-startedAt}ms)`);
      }
      inited=true;
      if(enableDefaultPricePlanBootstrap){
        const stepStartedAt=Date.now();
        await syncDefaultPricePlans().catch(err=>console.error('[api-bootstrap] sync default price plans failed',err));
        console.log(`[api-init] syncDefaultPricePlans done ${Date.now()-stepStartedAt}ms (total ${Date.now()-startedAt}ms)`);
      }
      {
        const stepStartedAt=Date.now();
        prewarmHotScanCache().catch(err=>console.error('[api-timing] prewarm hot tables failed',err));
        console.log(`[api-init] prewarmHotScanCache dispatched ${Date.now()-stepStartedAt}ms (total ${Date.now()-startedAt}ms)`);
      }
      console.log(`[api-timing] init cold start ${Date.now()-startedAt}ms`);
    })().catch(err=>{
      initPromise=null;
      inited=false;
      throw err;
    });
    return initPromise;
  }

  return {
    DEFAULT_CAMPUSES:getDefaultCampuses(),
    bootstrapDefaultUsers,
    ensureCoachBindings,
    ensureDefaultCampuses,
    collectShunyiMapoSeedStaleRowIds,
    collectShunyiMapoSeedImportedLedgerReplacementIds,
    repairImportedLedgerDuplicates,
    maybeRepairImportedLedgerDuplicates,
    bootstrapShunyiMapoFinanceSeed,
    scheduleInitInBackground,
    init,
    getRuntimeEnsuredTables
  };
}

module.exports={
  readBooleanEnv,
  resolveRuntimeStage,
  buildBootstrapSafetyFlags,
  logBlockedAutoWrite,
  DEFAULT_CAMPUSES,
  createBootstrapRuntime
};
