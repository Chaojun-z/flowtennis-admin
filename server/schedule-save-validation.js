const {
  SCHEDULE_CONFLICT_INDEX_READY_ID,
  scheduleConflictIndexRowsForRecord,
  scheduleConflictIndexPrefixesForRecord,
  scheduleRowsFromConflictIndex,
  staleScheduleConflictIndexRows
} = require('./schedule-conflict-index');

function scheduleTimeMs(value){
  const ms=new Date(String(value||'').replace(' ','T')).getTime();
  return Number.isFinite(ms)?ms:null;
}

function isHistoricalScheduleRecord(record,now=new Date()){
  const endMs=scheduleTimeMs(record?.endTime||record?.startTime);
  if(endMs===null)return false;
  return endMs<now.getTime();
}

function createScheduleSaveValidation(deps={}){
  const {
    scanByIdPrefix,put,del,get,mkTable,withRequiredStorageTimeout,withTimeout,timed,getCachedScan,
    isTableMissingError,validateScheduleConflicts,validateCourtBookingConflicts,collectScheduleRiskWarnings,
    normalizeCampusValue,T_SCHEDULE_CONFLICT_INDEX,T_SCHEDULE,T_COURTS
  }=deps;

  async function scheduleConflictIndexReady(){
    try{return !!(await get(T_SCHEDULE_CONFLICT_INDEX,SCHEDULE_CONFLICT_INDEX_READY_ID));}
    catch(err){
      if(!isTableMissingError(err))throw err;
      await mkTable(T_SCHEDULE_CONFLICT_INDEX);
      return false;
    }
  }
  async function loadScheduleConflictIndexRows(schedule){
    const prefixes=scheduleConflictIndexPrefixesForRecord(schedule,normalizeCampusValue);
    if(!prefixes.length)return [];
    try{
      const rows=await Promise.all(prefixes.map(prefix=>scanByIdPrefix(T_SCHEDULE_CONFLICT_INDEX,prefix).catch(err=>{
        if(isTableMissingError(err))return null;
        throw err;
      })));
      if(rows.some(row=>row===null)){
        await mkTable(T_SCHEDULE_CONFLICT_INDEX);
        return [];
      }
      return rows.flat();
    }catch(err){
      if(!isTableMissingError(err))throw err;
      await mkTable(T_SCHEDULE_CONFLICT_INDEX);
      return [];
    }
  }

  async function syncScheduleConflictIndexes(oldRecord,nextRecord){
    const nextRows=scheduleConflictIndexRowsForRecord(nextRecord,normalizeCampusValue);
    const staleRows=staleScheduleConflictIndexRows(oldRecord,nextRecord,normalizeCampusValue);
    try{
      for(const row of nextRows)await put(T_SCHEDULE_CONFLICT_INDEX,row.id,row);
      for(const row of staleRows)await del(T_SCHEDULE_CONFLICT_INDEX,row.id);
    }catch(err){
      if(!isTableMissingError(err))throw err;
      await mkTable(T_SCHEDULE_CONFLICT_INDEX);
      for(const row of nextRows)await put(T_SCHEDULE_CONFLICT_INDEX,row.id,row);
      for(const row of staleRows)await del(T_SCHEDULE_CONFLICT_INDEX,row.id);
    }
  }

  async function validateScheduleSave(nextRec){
    const schedules=await timed('load schedule conflict candidates',async()=>{
      if(await scheduleConflictIndexReady()){
        const indexRows=await withRequiredStorageTimeout(loadScheduleConflictIndexRows(nextRec),3500,'排课校验超时，请稍后重试');
        return scheduleRowsFromConflictIndex(indexRows);
      }
      return withRequiredStorageTimeout(getCachedScan(T_SCHEDULE),3500,'排课校验超时，请稍后重试');
    });
    const isHistorical=isHistoricalScheduleRecord(nextRec);
    validateScheduleConflicts(nextRec,schedules,nextRec.id,{skipVenueConflicts:isHistorical});
    if(!isHistorical){
      validateCourtBookingConflicts(nextRec,await timed('scan courts for schedule conflict check',()=>withTimeout(getCachedScan(T_COURTS).catch(()=>[]),2500,[])));
    }
    return {warnings:collectScheduleRiskWarnings(nextRec,schedules,nextRec.id)};
  }

  return {validateScheduleSave,syncScheduleConflictIndexes};
}

module.exports={createScheduleSaveValidation,isHistoricalScheduleRecord};
