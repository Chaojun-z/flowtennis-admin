#!/usr/bin/env node

const dotenv = require('dotenv');
const { createClientFromEnv, scanTable, putRow, deleteRow, createTableIfMissing } = require('./lib/staging-data-store');
const { assertProductionWriteTarget } = require('./lib/production-write-guard');
const { scheduleConflictIndexRowsForRecord } = require('../server/schedule-conflict-index');

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
  const existingIds=new Set((existingIndex||[]).map(row=>String(row.id||'')).filter(Boolean));
  return {
    expectedRows,
    staleIds:[...existingIds].filter(id=>!expectedById.has(id)),
    activeScheduleCount:(schedules||[]).filter(row=>row&&row.status!=='已取消').length
  };
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
    staleIndexRows:plan.staleIds.length
  },null,2));
  if(!write)return;
  for(const row of plan.expectedRows)await putRow(client,TABLES.conflictIndex,row);
  for(const id of plan.staleIds)await deleteRow(client,TABLES.conflictIndex,id);
  console.log('schedule conflict index backfill done');
}

if(require.main===module){
  main().catch(err=>{
    console.error(err);
    process.exit(1);
  });
}

module.exports={buildBackfillPlan,isProductionTarget};
