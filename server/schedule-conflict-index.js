const { isBillableSchedule, normalizeVenue } = require('./schedule.js');
const SCHEDULE_CONFLICT_INDEX_READY_ID='__meta|ready';

function parseArr(v){if(Array.isArray(v))return v;if(typeof v==='string'&&v){try{return JSON.parse(v)}catch{return[]}}return[];}
function text(value){return String(value||'').trim();}
function dateKey(value){return text(value).slice(0,10);}
function encodeKey(value){return encodeURIComponent(text(value));}
function defaultNormalizeCampus(value){return text(value);}
function sameText(a,b){return text(a)===text(b);}

function scheduleConflictCampus(row={},normalizeCampusValue=defaultNormalizeCampus){
  return text(normalizeCampusValue(row.campus||''));
}
function scheduleConflictDate(row={}){
  const start=dateKey(row.startTime);
  const end=dateKey(row.endTime);
  return start&&start===end?start:'';
}
function scheduleConflictKeyParts(row={},normalizeCampusValue=defaultNormalizeCampus){
  if(!row||!isBillableSchedule(row))return [];
  const date=scheduleConflictDate(row);
  if(!date||!row.id)return [];
  const parts=[];
  const coach=text(row.coach);
  if(coach)parts.push({date,type:'coach',key:coach});
  parseArr(row.studentIds).map(text).filter(Boolean).forEach(studentId=>parts.push({date,type:'student',key:studentId}));
  const campus=scheduleConflictCampus(row,normalizeCampusValue);
  const venue=normalizeVenue(row.venue);
  if(campus&&venue)parts.push({date,type:'venue',key:`${campus}|${venue}`});
  return parts;
}
function scheduleConflictIndexId(part,scheduleId){
  return `${part.date}|${part.type}|${encodeKey(part.key)}|${text(scheduleId)}`;
}
function scheduleConflictIndexPrefix(part){
  return `${part.date}|${part.type}|${encodeKey(part.key)}|`;
}
function scheduleConflictIndexRowsForRecord(row={},normalizeCampusValue=defaultNormalizeCampus){
  return scheduleConflictKeyParts(row,normalizeCampusValue).map(part=>({
    id:scheduleConflictIndexId(part,row.id),
    scheduleId:row.id,
    indexDate:part.date,
    indexType:part.type,
    indexKey:part.key,
    startTime:row.startTime||'',
    endTime:row.endTime||'',
    coach:row.coach||'',
    studentIds:parseArr(row.studentIds).filter(Boolean),
    campus:scheduleConflictCampus(row,normalizeCampusValue),
    venue:normalizeVenue(row.venue),
    status:row.status||'已排课',
    updatedAt:new Date().toISOString()
  }));
}
function scheduleConflictIndexPrefixesForRecord(row={},normalizeCampusValue=defaultNormalizeCampus){
  return [...new Set(scheduleConflictKeyParts(row,normalizeCampusValue).map(scheduleConflictIndexPrefix))];
}
function scheduleRowsFromConflictIndex(indexRows=[]){
  const rows=new Map();
  (indexRows||[]).forEach(row=>{
    const scheduleId=text(row.scheduleId);
    if(!scheduleId)return;
    const existing=rows.get(scheduleId)||{};
    rows.set(scheduleId,{
      ...existing,
      id:scheduleId,
      startTime:row.startTime||existing.startTime||'',
      endTime:row.endTime||existing.endTime||'',
      coach:row.coach||existing.coach||'',
      studentIds:parseArr(row.studentIds).length?parseArr(row.studentIds):parseArr(existing.studentIds),
      campus:row.campus||existing.campus||'',
      venue:row.venue||existing.venue||'',
      status:row.status||existing.status||'已排课'
    });
  });
  return [...rows.values()];
}
function staleScheduleConflictIndexRows(oldRecord={},nextRecord={},normalizeCampusValue=defaultNormalizeCampus){
  const nextIds=new Set(scheduleConflictIndexRowsForRecord(nextRecord,normalizeCampusValue).map(row=>row.id));
  return scheduleConflictIndexRowsForRecord(oldRecord,normalizeCampusValue).filter(row=>!nextIds.has(row.id));
}

module.exports={
  SCHEDULE_CONFLICT_INDEX_READY_ID,
  scheduleConflictIndexRowsForRecord,
  scheduleConflictIndexPrefixesForRecord,
  scheduleRowsFromConflictIndex,
  staleScheduleConflictIndexRows
};
