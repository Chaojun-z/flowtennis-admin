const {
  scheduleConflictIndexRowsForRecord,
  scheduleConflictIndexPrefixesForRecord,
  scheduleRowsFromConflictIndex,
  staleScheduleConflictIndexRows
} = require('./schedule-conflict-index');

function createScheduleSaveValidation(deps={}){
  const {
    scanByIdPrefix,put,del,mkTable,withRequiredStorageTimeout,withTimeout,timed,getCachedScan,
    isTableMissingError,validateScheduleConflicts,validateCourtBookingConflicts,collectScheduleRiskWarnings,
    normalizeCampusValue,T_SCHEDULE_CONFLICT_INDEX,T_COURTS
  }=deps;

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
    const indexRows=await timed('load schedule conflict index',()=>withRequiredStorageTimeout(loadScheduleConflictIndexRows(nextRec),3500,'排课校验超时，请稍后重试'));
    const schedules=scheduleRowsFromConflictIndex(indexRows);
    validateScheduleConflicts(nextRec,schedules,nextRec.id);
    validateCourtBookingConflicts(nextRec,await timed('scan courts for schedule conflict check',()=>withTimeout(getCachedScan(T_COURTS).catch(()=>[]),2500,[])));
    return {warnings:collectScheduleRiskWarnings(nextRec,schedules,nextRec.id)};
  }

  return {validateScheduleSave,syncScheduleConflictIndexes};
}

module.exports={createScheduleSaveValidation};
