#!/usr/bin/env node

const dotenv = require('dotenv');
const { createClientFromEnv, scanTable, putRow, deleteRow, createTableIfMissing } = require('./lib/staging-data-store');
const { assertProductionWriteTarget } = require('./lib/production-write-guard');
const { SCHEDULE_CONFLICT_INDEX_READY_ID, scheduleConflictIndexRowsForRecord } = require('../server/schedule-conflict-index');

const TABLES = {
  schedule: 'ft_schedule',
  conflictIndex: 'ft_schedule_conflict_index'
};
const PROD_INSTANCE = 'flowtennis-ue';

function loadEnv(){
  dotenv.config({ path: '.env' });
  dotenv.config({ path: '.env.local' });
}
function isWrite(argv=process.argv.slice(2)){
  return argv.includes('--write');
}
function isProductionTarget(env=process.env){
  return String(env.TS_INSTANCE||env.TARGET_TS_INSTANCE||'').trim()===PROD_INSTANCE;
}
function buildBackfillPlan(schedules=[],existingIndex=[]){
  const expectedRows=(schedules||[]).flatMap(row=>scheduleConflictIndexRowsForRecord(row));
  const expectedById=new Map(expectedRows.map(row=>[row.id,row]));
  const existingIds=new Set((existingIndex||[]).map(row=>String(row.id||'')).filter(Boolean).filter(id=>id!==SCHEDULE_CONFLICT_INDEX_READY_ID));
  return {
    expectedRows,
    missingRows:expectedRows.filter(row=>!existingIds.has(row.id)),
    staleIds:[...existingIds].filter(id=>!expectedById.has(id)),
    activeScheduleCount:(schedules||[]).filter(row=>row&&row.status!=='已取消').length
  };
}
async function retryTableStore(label,fn,maxAttempts=4){
  let lastErr;
  for(let attempt=1;attempt<=maxAttempts;attempt+=1){
    try{return await fn();}
    catch(err){
      lastErr=err;
      if(attempt===maxAttempts)break;
      await new Promise(resolve=>setTimeout(resolve,attempt*500));
    }
  }
  throw new Error(`${label} failed after ${maxAttempts} attempts: ${lastErr?.message||lastErr}`);
}
async function runWithConcurrency(items,limit,worker){
  const queue=items.slice();
  const workers=Array.from({length:Math.max(1,limit)},async()=>{
    while(queue.length){
      const item=queue.shift();
      await worker(item);
    }
  });
  await Promise.all(workers);
}
async function main(){
  loadEnv();
  const write=isWrite();
  const client=createClientFromEnv();
  if(write&&isProductionTarget()){
    await assertProductionWriteTarget();
  }
  if(write)await createTableIfMissing(client,TABLES.conflictIndex);
  const schedules=await scanTable(client,TABLES.schedule);
  let existingIndex=[];
  try{existingIndex=await scanTable(client,TABLES.conflictIndex);}catch(err){
    if(write)throw err;
  }
  const plan=buildBackfillPlan(schedules,existingIndex);
  console.log(JSON.stringify({
    dryRun:!write,
    scheduleRows:schedules.length,
    activeScheduleRows:plan.activeScheduleCount,
    expectedIndexRows:plan.expectedRows.length,
    missingIndexRows:plan.missingRows.length,
    staleIndexRows:plan.staleIds.length
  },null,2));
  if(!write)return;
  await runWithConcurrency(plan.missingRows,12,row=>retryTableStore(`put ${row.id}`,()=>putRow(client,TABLES.conflictIndex,row)));
  await runWithConcurrency(plan.staleIds,8,id=>retryTableStore(`delete ${id}`,()=>deleteRow(client,TABLES.conflictIndex,id)));
  await retryTableStore('mark ready',()=>putRow(client,TABLES.conflictIndex,{id:SCHEDULE_CONFLICT_INDEX_READY_ID,ready:true,scheduleRows:schedules.length,indexRows:plan.expectedRows.length,updatedAt:new Date().toISOString()}));
  console.log('schedule conflict index backfill done');
}

if(require.main===module){
  main().catch(err=>{
    console.error(err);
    process.exit(1);
  });
}

module.exports={buildBackfillPlan,isProductionTarget};
