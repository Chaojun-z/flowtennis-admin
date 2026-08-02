function parseArr(v){if(Array.isArray(v))return v;if(typeof v==='string'&&v){try{return JSON.parse(v)}catch{return[]}}return[];}
function parseLessonValue(v,fallback=0){
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}
function dateMs(v){if(!v)return NaN;if(v instanceof Date)return v.getTime();return new Date(String(v).replace(' ','T')).getTime();}
function normalizeVenue(v){
  const raw=String(v||'').trim();
  const m=raw.match(/([1-4])\s*号场/);
  return m?`${m[1]}号场`:raw;
}
function rangesOverlap(aStart,aEnd,bStart,bEnd){
  const as=dateMs(aStart),ae=dateMs(aEnd),bs=dateMs(bStart),be=dateMs(bEnd);
  if(!Number.isFinite(as)||!Number.isFinite(ae)||!Number.isFinite(bs)||!Number.isFinite(be))return false;
  return as<be&&bs<ae;
}
function minutesBetween(a,b){
  const am=dateMs(a),bm=dateMs(b);
  if(!Number.isFinite(am)||!Number.isFinite(bm))return null;
  return Math.round(Math.abs(bm-am)/60000);
}
function isBillableSchedule(rec){return rec&&rec.status!=='已取消';}
function scheduleSettlementType(rec){
  const raw=String(rec?.settlementType||rec?.paymentType||'').trim();
  if(['direct','直接收款','paid'].includes(raw))return 'direct';
  if(['gift','free','赠送','免费'].includes(raw))return 'gift';
  return 'package';
}
function isPackageSettlementSchedule(rec){return scheduleSettlementType(rec)==='package';}
function isDirectPaidSchedule(rec){return scheduleSettlementType(rec)==='direct';}
function isScheduleLessonCharged(rec){return isBillableSchedule(rec)&&!rec.coachLateFree&&isPackageSettlementSchedule(rec);}
function scheduleLessonDelta(rec){
  if(!rec||!rec.classId||!isScheduleLessonCharged(rec))return null;
  const lessonCount=parseLessonValue(rec.lessonCount);
  if(lessonCount<=0)return null;
  return {classId:rec.classId,delta:lessonCount};
}
function effectiveScheduleStatus(rec,now=new Date()){
  if(!rec)return '';
  const status=rec.status||'已排课';
  if(status==='已下课')return '已结束';
  if(status==='已取消'||status==='已结束')return status;
  const end=dateMs(rec.endTime);
  const nowMs=now instanceof Date?now.getTime():dateMs(now);
  if(status==='已排课'&&Number.isFinite(end)&&Number.isFinite(nowMs)&&end<nowMs)return '已结束';
  return status;
}
function scheduleLessonChargeStatus(rec,ledger=[]){
  if(!rec||effectiveScheduleStatus(rec)==='已取消')return '不扣课';
  if(rec.coachLateFree)return '迟到免费';
  if(isDirectPaidSchedule(rec))return '直接收款';
  if(scheduleSettlementType(rec)==='gift')return '赠送免费';
  if(parseLessonValue(rec.lessonCount)<=0)return '不扣课';
  if(!rec.entitlementId)return '未扣课';
  const used=(ledger||[]).some(l=>l.scheduleId===rec.id&&l.entitlementId===rec.entitlementId&&parseLessonValue(l.lessonDelta)<0);
  return used?'已扣课':'扣课异常';
}
function assertCanWriteSchedule(user){
  if(user?.role==='admin')return;
  throw new Error('无权限');
}
function shareStudent(a,b){
  const aIds=parseArr(a.studentIds).filter(Boolean);
  const bIds=parseArr(b.studentIds).filter(Boolean);
  if(aIds.length&&bIds.length)return aIds.some(id=>bIds.includes(id));
  const an=String(a.studentName||'').trim();
  const bn=String(b.studentName||'').trim();
  return !!(an&&bn&&an===bn);
}
function normalizedCampusValue(value,normalizeCampusValue){
  return typeof normalizeCampusValue==='function'?normalizeCampusValue(value):String(value||'').trim();
}
function sameCampusValue(a,b,normalizeCampusValue){
  return normalizedCampusValue(a,normalizeCampusValue)===normalizedCampusValue(b,normalizeCampusValue);
}
function linkedVenueConflictAllowed(candidate={},record={}){
  if(!candidate.allowLinkedVenueConflict&&!candidate.linkedScheduleGroupId&&!record.linkedScheduleGroupId)return false;
  const candidateGroup=String(candidate.linkedScheduleGroupId||'').trim();
  const recordGroup=String(record.linkedScheduleGroupId||'').trim();
  if(candidateGroup&&recordGroup&&candidateGroup===recordGroup)return true;
  return !!candidate.allowLinkedVenueConflict;
}
function validateScheduleConflicts(candidate,schedules,excludeId,normalizeCampusValue,options={}){
  const skipVenueConflicts=options?.skipVenueConflicts===true;
  if(!isBillableSchedule(candidate))return;
  if(!candidate.startTime)throw new Error('请选择上课时间');
  if(!candidate.endTime)throw new Error('请选择下课时间，系统需要用它校验冲突');
  if(String(candidate.startTime).slice(0,10)!==String(candidate.endTime).slice(0,10))throw new Error('上课时间不能跨天');
  if(dateMs(candidate.endTime)<=dateMs(candidate.startTime))throw new Error('下课时间不能早于上课时间');
  for(const rec of schedules||[]){
    if(!rec||rec.id===(excludeId||candidate.id)||!isBillableSchedule(rec))continue;
    if(!rangesOverlap(candidate.startTime,candidate.endTime,rec.startTime,rec.endTime))continue;
    if(candidate.coach&&rec.coach&&candidate.coach===rec.coach)throw new Error(`教练「${candidate.coach}」此时间已有课程`);
    const candidateVenue=normalizeVenue(candidate.venue);
    const recVenue=normalizeVenue(rec.venue);
    if(!skipVenueConflicts&&candidateVenue&&recVenue&&candidateVenue===recVenue&&sameCampusValue(candidate.campus,rec.campus,normalizeCampusValue)&&!linkedVenueConflictAllowed(candidate,rec))throw new Error(`场地「${candidateVenue}」此时间已被占用`);
    if(shareStudent(candidate,rec))throw new Error('学员此时间已有课程');
  }
}
function courtBookingRange(court,row){
  if(row?.type&&row.type!=='消费')return null;
  if(row?.category&&row.category!=='订场')return null;
  if(!row?.date||!row?.startTime||!row?.endTime)return null;
  const campus=row.campus||court?.campus||'';
  const venue=normalizeVenue(row.venue||'');
  if(!campus||!venue)return null;
  const startClock=String(row.startTime).includes(' ')?String(row.startTime).slice(11,16):String(row.startTime).slice(0,5);
  const endClock=String(row.endTime).includes(' ')?String(row.endTime).slice(11,16):String(row.endTime).slice(0,5);
  return {
    courtName:court?.name||'订场用户',
    campus,
    venue,
    startTime:`${row.date} ${startClock}`,
    endTime:`${row.date} ${endClock}`
  };
}
function validateCourtBookingConflicts(candidate,courts,normalizeCourtHistory=()=>[],normalizeCampusValue){
  if(candidate?.scheduleSource==='订场陪打')return;
  if(!isBillableSchedule(candidate)||!candidate.startTime||!candidate.endTime||!candidate.campus||!candidate.venue)return;
  const candidateVenue=normalizeVenue(candidate.venue);
  for(const court of courts||[]){
    for(const row of normalizeCourtHistory(court.history)){
      const booking=courtBookingRange(court,row);
      if(!booking)continue;
      if(!sameCampusValue(booking.campus,candidate.campus,normalizeCampusValue)||booking.venue!==candidateVenue)continue;
      if(rangesOverlap(candidate.startTime,candidate.endTime,booking.startTime,booking.endTime)){
        throw new Error(`场地「${candidateVenue}」${booking.startTime.slice(11,16)}-${booking.endTime.slice(11,16)} 已被订场用户「${booking.courtName}」订场`);
      }
    }
  }
}
function scheduleParticipantSummary(rec){
  const actual=parseArr(rec?.studentIds).filter(Boolean);
  const expected=parseArr(rec?.expectedStudentIds).filter(Boolean);
  const base=expected.length?expected:actual;
  const actualSet=new Set(actual);
  return {
    expectedCount:base.length,
    actualCount:actual.length,
    absentCount:base.filter(id=>!actualSet.has(id)).length
  };
}
function collectScheduleRiskWarnings(candidate,schedules,excludeId,campusDisplayName=(value)=>String(value||'').trim(),normalizeCampusValue){
  if(!isBillableSchedule(candidate)||!candidate.coach||!candidate.campus||!candidate.startTime||!candidate.endTime)return[];
  const warnings=[];
  const currentCampusText=campusDisplayName(candidate.campus,candidate.externalVenueName||candidate.venue);
  for(const rec of schedules||[]){
    if(!rec||rec.id===(excludeId||candidate.id)||!isBillableSchedule(rec))continue;
    if(rec.coach!==candidate.coach||!rec.campus||sameCampusValue(rec.campus,candidate.campus,normalizeCampusValue))continue;
    const prevCampusText=campusDisplayName(rec.campus,rec.externalVenueName||rec.venue);
    const gapBefore=minutesBetween(rec.endTime,candidate.startTime);
    if(gapBefore!==null&&dateMs(rec.endTime)<=dateMs(candidate.startTime)&&gapBefore<60){
      warnings.push(`跨校区提醒：${candidate.coach}上一节在 ${prevCampusText}，下一节在 ${currentCampusText}，中间仅 ${gapBefore} 分钟`);
      continue;
    }
    const gapAfter=minutesBetween(candidate.endTime,rec.startTime);
    if(gapAfter!==null&&dateMs(candidate.endTime)<=dateMs(rec.startTime)&&gapAfter<60){
      warnings.push(`跨校区提醒：${candidate.coach}上一节在 ${currentCampusText}，下一节在 ${prevCampusText}，中间仅 ${gapAfter} 分钟`);
    }
  }
  return [...new Set(warnings)];
}
function createScheduleRules({normalizeCourtHistory,campusDisplayName,normalizeCampusValue}={}){
  return {
    isBillableSchedule,
    scheduleSettlementType,
    isPackageSettlementSchedule,
    isDirectPaidSchedule,
    isScheduleLessonCharged,
    scheduleLessonDelta,
    effectiveScheduleStatus,
    scheduleLessonChargeStatus,
    assertCanWriteSchedule,
    validateScheduleConflicts(candidate,schedules,excludeId,options){
      return validateScheduleConflicts(candidate,schedules,excludeId,normalizeCampusValue,options);
    },
    courtBookingRange,
    validateCourtBookingConflicts(candidate,courts){
      return validateCourtBookingConflicts(candidate,courts,normalizeCourtHistory,normalizeCampusValue);
    },
    scheduleParticipantSummary,
    collectScheduleRiskWarnings(candidate,schedules,excludeId){
      return collectScheduleRiskWarnings(candidate,schedules,excludeId,campusDisplayName,normalizeCampusValue);
    }
  };
}

module.exports={
  createScheduleRules,
  isBillableSchedule,
  scheduleSettlementType,
  isPackageSettlementSchedule,
  isDirectPaidSchedule,
  isScheduleLessonCharged,
  scheduleLessonDelta,
  effectiveScheduleStatus,
  scheduleLessonChargeStatus,
  assertCanWriteSchedule,
  validateScheduleConflicts,
  courtBookingRange,
  validateCourtBookingConflicts,
  scheduleParticipantSummary,
  collectScheduleRiskWarnings
  ,normalizeVenue
};
