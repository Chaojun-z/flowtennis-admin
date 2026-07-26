const crypto = require('crypto');
const axios = require('axios');

function cleanText(value){
  return String(value??'').replace(/\u00a0/g,' ').trim();
}

function normalizeNameKey(value){
  return cleanText(value)
    .toLowerCase()
    .replace(/[.·\s]/g,'')
    .replace(/[（(][^）)]*[）)]/g,'')
    .replace(/教练$/,'')
    .trim();
}

function parseLessonIndex(value){
  const m=cleanText(value).match(/[（(]\s*(\d+)\s*[）)]/);
  return m?parseInt(m[1],10):null;
}

function parseStudentCell(value){
  const raw=cleanText(value);
  const lessonIndex=parseLessonIndex(raw);
  const withoutIndex=raw.replace(/[（(]\s*\d+\s*[）)]/g,'').trim();
  const names=withoutIndex.split(/[、,，/]+/).map(cleanText).filter(Boolean);
  return {raw,names,lessonIndex};
}

function normalizeStudentNameKey(value){
  return cleanText(value)
    .toLowerCase()
    .replace(/[.·\s]/g,'')
    .replace(/[（(]\s*\d+\s*[）)]/g,'')
    .trim();
}

function studentNameKeys(value){
  const text=cleanText(value);
  const keys=new Set();
  const add=(item)=>{
    const key=normalizeStudentNameKey(item);
    if(key)keys.add(key);
  };
  add(text);
  add(text.replace(/[（(][^）)]*[）)]/g,''));
  const bracketRe=/[（(]([^）)]*)[）)]/g;
  let match;
  while((match=bracketRe.exec(text))){
    if(!/^\s*\d+\s*$/.test(match[1]))add(match[1]);
  }
  return [...keys];
}

function excelSerialToDate(value){
  const n=Number(value);
  if(!Number.isFinite(n))return '';
  const utc=Date.UTC(1899,11,30)+Math.round(n*86400000);
  return new Date(utc).toISOString().slice(0,10);
}

function normalizeDateCell(value){
  if(value===null||value===undefined||value==='')return '';
  if(typeof value==='number')return excelSerialToDate(value);
  const text=cleanText(value);
  if(/^\d+(\.\d+)?$/.test(text))return excelSerialToDate(text);
  const m=text.match(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})/);
  if(m)return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  const md=text.match(/(\d{1,2})[月/-](\d{1,2})/);
  if(md){
    const year=new Date().getFullYear();
    return `${year}-${String(md[1]).padStart(2,'0')}-${String(md[2]).padStart(2,'0')}`;
  }
  return text.slice(0,10);
}

function parseTimeRange(value){
  const text=cleanText(value).replace(/[—–]/g,'-');
  const m=text.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if(!m)return null;
  return {start:m[1].padStart(5,'0'),end:m[2].padStart(5,'0')};
}

function minutesBetween(start,end){
  const [sh,sm]=String(start||'').split(':').map(Number);
  const [eh,em]=String(end||'').split(':').map(Number);
  if(!Number.isFinite(sh)||!Number.isFinite(sm)||!Number.isFinite(eh)||!Number.isFinite(em))return 0;
  return (eh*60+em)-(sh*60+sm);
}

function normalizeCourseType(value){
  const text=cleanText(value);
  if(!text)return {ok:false,reason:'缺少课程类型'};
  const isTrial=/体验/.test(text);
  const audience=/青少|儿童|少儿/.test(text)?'青少年':(/成人/.test(text)?'成人':'');
  if(isTrial&&!audience)return {ok:false,reason:'体验课无法判断成人/青少年',raw:text};
  if(isTrial)return {ok:true,raw:text,courseType:'体验课',experienceType:audience,audience,isTrial:true};
  if(/团课|小班/.test(text))return {ok:true,raw:text,courseType:'小班课',experienceType:'',audience,smallClassType:/训练营/.test(text)?'bootcamp':'single',isTrial:false};
  if(/私教|正式/.test(text))return {ok:true,raw:text,courseType:'私教课',experienceType:'',audience,isTrial:false};
  return {ok:false,reason:`无法识别课程类型：${text}`,raw:text};
}

function normalizeVenueName(value){
  const text=cleanText(value);
  if(/马坡/.test(text))return {campus:'shunyi_mapo',locationType:'own'};
  return {campus:text? '__external__':'',locationType:text?'external':'own'};
}

function normalizeCourtName(value){
  const text=cleanText(value);
  if(!text)return '';
  if(/号场$/.test(text))return text;
  if(/^\d+$/.test(text))return `${text}号场`;
  if(/^\d+号$/.test(text))return `${text}场`;
  return text;
}

function applyMergesToValues(values=[],merges=[]){
  const grid=(values||[]).map(row=>Array.isArray(row)?row.slice():[]);
  for(const merge of merges||[]){
    const sr=parseInt(merge.start_row_index);
    const er=parseInt(merge.end_row_index);
    const sc=parseInt(merge.start_column_index);
    const ec=parseInt(merge.end_column_index);
    if(!Number.isFinite(sr)||!Number.isFinite(er)||!Number.isFinite(sc)||!Number.isFinite(ec))continue;
    const value=grid[sr]?.[sc];
    if(value===undefined||value===null||value==='')continue;
    for(let r=sr;r<=er;r++){
      if(!grid[r])grid[r]=[];
      for(let c=sc;c<=ec;c++)if(grid[r][c]===undefined||grid[r][c]===null||grid[r][c]==='')grid[r][c]=value;
    }
  }
  return grid;
}

function findHeaderRow(values=[]){
  for(let r=0;r<Math.min(values.length,8);r++){
    const row=values[r]||[];
    const courseCount=row.filter(cell=>cleanText(cell)==='课程').length;
    const studentCount=row.filter(cell=>cleanText(cell)==='学员').length;
    if(courseCount>0&&studentCount>0)return r;
  }
  return 1;
}

function buildCoachBlocks(values=[]){
  const headerRow=findHeaderRow(values);
  const row=values[headerRow]||[];
  const titleRow=values[Math.max(0,headerRow-1)]||[];
  const blocks=[];
  for(let c=0;c<row.length;c++){
    if(cleanText(row[c])!=='课程')continue;
    const title=cleanText(titleRow[c]||titleRow[c-1]||'');
    if(!title)continue;
    blocks.push({
      coachName:title,
      startCol:c,
      courseCol:c,
      venueCol:c+1,
      courtCol:c+2,
      studentCol:c+3
    });
  }
  return {headerRow,blocks};
}

function lessonCellKey(cell){
  return [
    cell.date,
    cell.block.coachName,
    cell.courseText,
    cell.venueText,
    cell.courtText,
    cell.studentText
  ].map(normalizeNameKey).join('|');
}

function parseFeishuScheduleRows({values=[],merges=[],sheetId='',sheetTitle=''}={}){
  const merged=applyMergesToValues(values,merges);
  const {headerRow,blocks}=buildCoachBlocks(merged);
  const cells=[];
  let currentDate='';
  for(let r=headerRow+1;r<merged.length;r++){
    const row=merged[r]||[];
    const date=normalizeDateCell(row[0])||currentDate;
    if(date)currentDate=date;
    const time=parseTimeRange(row[2]);
    if(!date||!time)continue;
    for(const block of blocks){
      const courseText=cleanText(row[block.courseCol]);
      const studentText=cleanText(row[block.studentCol]);
      const venueText=cleanText(row[block.venueCol]);
      const courtText=cleanText(row[block.courtCol]);
      if(!courseText&&!studentText)continue;
      cells.push({sheetId,sheetTitle,rowIndex:r,colIndex:block.courseCol,date,time,block,courseText,studentText,venueText,courtText});
    }
  }
  const grouped=[];
  const previousByKey=new Map();
  for(const cell of cells){
    const key=lessonCellKey(cell);
    const prev=previousByKey.get(key);
    if(prev&&prev.cellKey===lessonCellKey(cell)&&prev.date===cell.date&&prev.endClock===cell.time.start){
      prev.endClock=cell.time.end;
      prev.endRowIndex=cell.rowIndex;
      continue;
    }
    const next={
      cellKey:key,
      sheetId:cell.sheetId,
      sheetTitle:cell.sheetTitle,
      startRowIndex:cell.rowIndex,
      endRowIndex:cell.rowIndex,
      colIndex:cell.colIndex,
      date:cell.date,
      startClock:cell.time.start,
      endClock:cell.time.end,
      coachName:cell.block.coachName,
      courseText:cell.courseText,
      venueText:cell.venueText,
      courtText:cell.courtText,
      studentText:cell.studentText
    };
    grouped.push(next);
    previousByKey.set(key,next);
  }
  return grouped.map(row=>{
    const course=normalizeCourseType(row.courseText);
    const students=parseStudentCell(row.studentText);
    const venue=normalizeVenueName(row.venueText);
    const venueName=normalizeCourtName(row.courtText);
    const durationMinutes=minutesBetween(row.startClock,row.endClock);
    const sourceKey=[
      row.sheetId,row.date,row.startClock,row.endClock,normalizeNameKey(row.coachName),
      normalizeNameKey(row.studentText),normalizeNameKey(row.courseText),normalizeNameKey(row.venueText),normalizeNameKey(row.courtText)
    ].join('|');
    return {
      ...row,
      sourceKey,
      fingerprint:sha256(JSON.stringify({row,course,students,venue,venueName,durationMinutes})),
      startTime:`${row.date} ${row.startClock}`,
      endTime:`${row.date} ${row.endClock}`,
      durationMinutes,
      lessonCount:durationMinutes/60,
      course,
      studentNames:students.names,
      lessonIndex:students.lessonIndex,
      campus:venue.campus,
      locationType:venue.locationType,
      venue:venueName,
      sourceCell:`R${row.startRowIndex+1}C${row.colIndex+1}`
    };
  });
}

function sha256(value){
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function chinaDateTimeKey(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date).reduce((acc,item)=>({...acc,[item.type]:item.value}),{});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function isFutureCourse(course,nowKey=chinaDateTimeKey()){
  return String(course?.startTime||'').slice(0,16)>=nowKey;
}

function validDateKey(value){
  const text=cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text)?text:'';
}

function courseInDateRange(course,startDate='',endDate=''){
  const date=String(course?.startTime||course?.date||'').slice(0,10);
  if(startDate&&date<startDate)return false;
  if(endDate&&date>endDate)return false;
  return !!date;
}

function activeSchedule(row){
  return row&&String(row.status||'已排课')!=='已取消';
}

function sameTime(a,b){
  return String(a.startTime||'')===String(b.startTime||'')&&String(a.endTime||'')===String(b.endTime||'');
}

function scheduleCandidateFields(candidate){
  const resolvedStudents=Array.isArray(candidate.scheduleStudents)?candidate.scheduleStudents:candidate.resolvedStudents;
  return {
    startTime:candidate.startTime,
    endTime:candidate.endTime,
    coach:candidate.resolvedCoach?.name||candidate.coachName,
    campus:candidate.campus,
    venue:candidate.venue,
    courseType:candidate.course.courseType,
    experienceType:candidate.course.experienceType||'',
    studentIds:resolvedStudents.map(row=>row.id),
    studentName:resolvedStudents.map(row=>row.name||row.id).join('、')
  };
}

function exactScheduleMatch(candidate,schedules=[]){
  const fields=scheduleCandidateFields(candidate);
  const studentSet=new Set(fields.studentIds.map(String));
  return (schedules||[]).find(row=>{
    if(!activeSchedule(row)||!sameTime(fields,row))return false;
    if(String(row.coach||'')!==String(fields.coach||''))return false;
    if(String(row.campus||'')!==String(fields.campus||''))return false;
    if(String(row.venue||'')!==String(fields.venue||''))return false;
    if(String(row.courseType||'')!==String(fields.courseType||''))return false;
    if(String(row.experienceType||'')!==String(fields.experienceType||''))return false;
    const ids=parseMaybeArray(row.studentIds).map(String);
    return ids.length===studentSet.size&&ids.every(id=>studentSet.has(id));
  })||null;
}

function parseMaybeArray(value){
  if(Array.isArray(value))return value;
  if(typeof value==='string'&&value){
    try{return JSON.parse(value);}catch{return value.split(/[、,，/]+/).map(cleanText).filter(Boolean);}
  }
  return [];
}

function uniqueByName(rows=[],name=''){
  const key=normalizeStudentNameKey(name);
  const candidates=(rows||[]).map(row=>({row,keys:studentNameKeys(row.name||row.studentName||row.leadName)}));
  const exact=candidates.filter(item=>item.keys.includes(key)).map(item=>item.row);
  if(exact.length===1)return exact[0];
  const fuzzy=candidates.filter(item=>item.keys.some(itemKey=>itemKey&&key&&(itemKey.includes(key)||key.includes(itemKey)))).map(item=>item.row);
  return fuzzy.length===1?fuzzy[0]:null;
}

function pushCoachRef(refs,row={}){
  const id=cleanText(row.id||row.coachId||row.username);
  const name=cleanText(row.coachName||row.name||row.displayName||row.username||row.coach||id);
  if(!name&&!id)return;
  const aliasValues=[
    row.alias,row.aliases,row.nickname,row.nickName,row.displayName,row.username,row.coachName,row.name,row.coach
  ].flatMap(value=>Array.isArray(value)?value:[value]).map(cleanText).filter(Boolean);
  refs.push({id,name,keys:[name,id,...aliasValues].map(normalizeNameKey).filter(Boolean)});
}

function uniqueCoachRef(refs=[],coachName=''){
  const key=normalizeNameKey(coachName);
  const matchedByName=new Map();
  for(const ref of refs){
    if(!(ref.keys||[]).includes(key))continue;
    const stableKey=`${ref.id||''}|${normalizeNameKey(ref.name)}`;
    matchedByName.set(stableKey,{id:ref.id||'',name:ref.name||ref.id});
  }
  const matched=[...matchedByName.values()];
  return matched.length===1?matched[0]:null;
}

function matchCoach(coaches=[],users=[],coachName='',schedules=[],students=[]){
  const refs=[];
  (coaches||[]).forEach(row=>pushCoachRef(refs,row));
  (users||[])
    .filter(row=>row.coachName||row.coachId||String(row.role||'').includes('coach')||String(row.role||'')==='editor')
    .forEach(row=>pushCoachRef(refs,row));
  (students||[]).forEach(row=>pushCoachRef(refs,{name:row.primaryCoach||'',id:row.primaryCoachId||''}));
  const direct=uniqueCoachRef(refs,coachName);
  if(direct)return direct;
  (schedules||[]).filter(activeSchedule).forEach(row=>pushCoachRef(refs,{id:row.coachId||'',name:row.coach||row.coachName||''}));
  return uniqueCoachRef(refs,coachName);
}

function inferCoachFromResolvedStudents(rawCoachName='',students=[]){
  const refs=[];
  (students||[]).forEach(row=>pushCoachRef(refs,{name:row.primaryCoach||row.coach||row.coachName||'',id:row.primaryCoachId||row.coachId||''}));
  const matched=uniqueCoachRef(refs,rawCoachName);
  if(matched)return matched;
  const raw=cleanText(rawCoachName);
  return raw?{id:'',name:raw}:null;
}

function buildResolvedCandidate(raw,ctx={}){
  const errors=[];
  if(!raw.course.ok)errors.push(raw.course.reason);
  if(!raw.studentNames.length)errors.push('缺少学员');
  if(!raw.campus)errors.push('缺少场馆');
  if(!raw.venue)errors.push('缺少场地号');
  const resolvedStudents=[];
  const unresolvedStudents=[];
  for(const name of raw.studentNames){
    const student=uniqueByName(ctx.students,name);
    if(student)resolvedStudents.push(student);
    else unresolvedStudents.push(name);
  }
  const resolvedCoach=matchCoach(ctx.coaches,ctx.users,raw.coachName,ctx.schedules,ctx.students)||inferCoachFromResolvedStudents(raw.coachName,resolvedStudents);
  if(!resolvedCoach)errors.push(`无法唯一识别教练：${raw.coachName}`);
  if(raw.course.isTrial){
    if(raw.durationMinutes!==60)errors.push('体验课时长不是 1 小时，需要运营确认');
  }else if(!resolvedStudents.length){
    errors.push(`无法唯一识别正式课学员：${raw.studentNames.join('、')}`);
  }
  return {...raw,resolvedCoach,resolvedStudents,unresolvedStudents,errors};
}

function hasSelectableEntitlement(student,candidate,entitlements=[],recommendEntitlements){
  if(!student?.id)return false;
  const body=buildScheduleBody({...candidate,scheduleStudents:[student]});
  const rows=(entitlements||[]).filter(row=>String(row.studentId||'')===String(student.id||''));
  if(typeof recommendEntitlements==='function'){
    const result=recommendEntitlements(rows,body);
    if(!result?.recommended)return false;
    const selected=rows.find(row=>String(row.id||'')===String(result.recommended.entitlementId||result.recommended.id||''));
    return !!selected&&entitlementLessonIndexMatches(selected,candidate);
  }
  return rows.some(row=>{
    if(row.status&&row.status!=='active')return false;
    if(row.courseType&&row.courseType!==candidate.course.courseType)return false;
    if(row.experienceType&&candidate.course.experienceType&&row.experienceType!==candidate.course.experienceType)return false;
    if(!entitlementLessonIndexMatches(row,candidate))return false;
    return Number(row.remainingLessons||0)>=Number(candidate.lessonCount||1);
  });
}

function entitlementExpectedLessonIndex(row={}){
  const used=Number(row.usedLessons);
  if(Number.isFinite(used))return Math.floor(used)+1;
  const total=Number(row.totalLessons);
  const remaining=Number(row.remainingLessons);
  if(Number.isFinite(total)&&Number.isFinite(remaining))return Math.floor(Math.max(0,total-remaining))+1;
  return null;
}

function entitlementLessonIndexMatches(row={},candidate={}){
  const index=Number(candidate.lessonIndex);
  if(!Number.isFinite(index)||index<=0)return true;
  const expected=entitlementExpectedLessonIndex(row);
  return expected!==null&&expected===index;
}

function hasSelectableEntitlementIgnoringLessonIndex(student,candidate,entitlements=[],recommendEntitlements){
  return hasSelectableEntitlement(student,{...candidate,lessonIndex:null},entitlements,recommendEntitlements);
}

function attachSchedulableStudents(candidate,ctx={}){
  if(candidate.errors.length)return candidate;
  if(candidate.course.isTrial)return {...candidate,scheduleStudents:candidate.resolvedStudents.slice(0,1)};
  const scheduleStudents=candidate.resolvedStudents.filter(student=>hasSelectableEntitlement(student,candidate,ctx.entitlements,ctx.recommendEntitlements));
  if(!scheduleStudents.length){
    const hasPackageWithMismatchedIndex=Number(candidate.lessonIndex)>0&&candidate.resolvedStudents.some(student=>hasSelectableEntitlementIgnoringLessonIndex(student,candidate,ctx.entitlements,ctx.recommendEntitlements));
    if(hasPackageWithMismatchedIndex){
      return {...candidate,scheduleStudents:[],errors:[...candidate.errors,'飞书括号课时编号和系统课包进度不一致，需要运营确认']};
    }
    return {...candidate,scheduleStudents:[],errors:[...candidate.errors,'没有可自动扣课的可用课包']};
  }
  return {...candidate,scheduleStudents};
}

function buildDryRunPlan({feishuCourses=[],syncRows=[],schedules=[],students=[],coaches=[],users=[],entitlements=[],recommendEntitlements=null}={}){
  const ctx={students,coaches,users,schedules,entitlements,recommendEntitlements};
  const syncByKey=new Map((syncRows||[]).filter(row=>row.status!=='ignored').map(row=>[String(row.sourceKey||''),row]));
  const activeSourceKeys=new Set();
  const actions=[];
  for(const raw of feishuCourses){
    let candidate=buildResolvedCandidate(raw,ctx);
    activeSourceKeys.add(candidate.sourceKey);
    const sync=syncByKey.get(candidate.sourceKey);
    if(candidate.errors.length){
      actions.push({type:'notify_error',sourceKey:candidate.sourceKey,candidate,reason:candidate.errors.join('；')});
      continue;
    }
    if(sync?.scheduleId){
      const existing=(schedules||[]).find(row=>String(row.id||'')===String(sync.scheduleId));
      if(!existing){
        actions.push({type:'notify_error',sourceKey:candidate.sourceKey,candidate,reason:'同步记录绑定的系统排课不存在'});
      }else if(sync.lastFingerprint!==candidate.fingerprint){
        actions.push({type:'update_schedule',sourceKey:candidate.sourceKey,candidate,sync,schedule:existing});
      }else{
        actions.push({type:'noop',sourceKey:candidate.sourceKey,candidate,sync,schedule:existing});
      }
      continue;
    }
    const exact=exactScheduleMatch(candidate,schedules);
    if(exact){
      actions.push({type:'bind_existing',sourceKey:candidate.sourceKey,candidate,schedule:exact});
      continue;
    }
    candidate=attachSchedulableStudents(candidate,ctx);
    if(candidate.errors.length){
      actions.push({type:'notify_error',sourceKey:candidate.sourceKey,candidate,reason:candidate.errors.join('；')});
      continue;
    }
    actions.push({type:candidate.course.isTrial?'create_trial_schedule':'create_schedule',sourceKey:candidate.sourceKey,candidate});
  }
  for(const row of syncRows||[]){
    if(row.status!=='active')continue;
    const key=String(row.sourceKey||'');
    if(!key||activeSourceKeys.has(key))continue;
    actions.push({type:'pending_delete',sourceKey:key,sync:row});
  }
  return summarizePlan(actions);
}

function buildScheduleBody(candidate,extra={}){
  const scheduleStudents=Array.isArray(extra.scheduleStudents)?extra.scheduleStudents:(Array.isArray(candidate.scheduleStudents)?candidate.scheduleStudents:candidate.resolvedStudents);
  const courseType=candidate.course.courseType;
  const experienceType=candidate.course.experienceType||'';
  const isTrial=courseType==='体验课';
  const studentName=scheduleStudents.map(row=>row.name||row.id).join('、');
  const locationType=candidate.locationType==='external'?'external':'own';
  const entitlement=extra.entitlement||{};
  const purchase=extra.purchase||{};
  const entitlementId=extra.entitlementId||entitlement.id||'';
  return {
    startTime:candidate.startTime,
    endTime:candidate.endTime,
    studentIds:scheduleStudents.map(row=>row.id),
    expectedStudentIds:scheduleStudents.map(row=>row.id),
    absentStudentIds:[],
    studentName,
    courseType,
    experienceType,
    courseTypeLevel2:isTrial?`${experienceType}体验课`:(courseType==='小班课'?'单次':`${candidate.course.audience||''}私教课`),
    standardCourseType:isTrial?`${experienceType}私教【体验】`:(courseType==='小班课'?`${candidate.course.audience||''}小班课/单次`:`${candidate.course.audience||''}私教【正式】`),
    isTrial,
    smallClassType:courseType==='小班课'?(candidate.course.smallClassType||'single'):'',
    coach:candidate.resolvedCoach?.name||candidate.coachName,
    coachId:candidate.resolvedCoach?.id||'',
    locationType,
    venue:candidate.venue,
    campus:candidate.campus,
    externalVenueName:locationType==='external'?candidate.venueText:'',
    externalCourtName:locationType==='external'?candidate.courtText:'',
    externalNotes:'',
    lessonCount:candidate.lessonCount,
    status:'已排课',
    settlementType:'package',
    payMethod:'',
    paidAmount:0,
    entitlementId,
    entitlementIds:entitlementId?[entitlementId]:[],
    packageName:extra.packageName||entitlement.packageName||purchase.packageName||'',
    purchaseId:extra.purchaseId||entitlement.purchaseId||purchase.id||'',
    timeBand:'',
    requiresFieldFee:false,
    fieldFeeReason:'',
    fieldFeeAmount:0,
    fieldFeePayMethod:'',
    fieldFeeNote:'',
    cancelReason:'',
    notifyStatus:'',
    confirmStatus:'',
    scheduleSource:'feishu-sheet',
    sourceLeadId:extra.sourceLeadId||'',
    sourceLeadName:extra.sourceLeadName||'',
    actualStudentCount:Math.max(scheduleStudents.length,candidate.studentNames.length||1),
    notes:`飞书排课表同步 ${candidate.sheetTitle||candidate.sheetId||''} ${candidate.sourceCell||''}`.trim()
  };
}

function summarizePlan(actions=[]){
  const summary={total:actions.length,noop:0,bindExisting:0,create:0,createTrial:0,update:0,pendingDelete:0,notifyError:0};
  actions.forEach(action=>{
    if(action.type==='noop')summary.noop+=1;
    else if(action.type==='bind_existing')summary.bindExisting+=1;
    else if(action.type==='create_schedule')summary.create+=1;
    else if(action.type==='create_trial_schedule')summary.createTrial+=1;
    else if(action.type==='update_schedule')summary.update+=1;
    else if(action.type==='pending_delete')summary.pendingDelete+=1;
    else if(action.type==='notify_error')summary.notifyError+=1;
  });
  return {summary,actions};
}

function safeHistoryApplyPlan(plan={}){
  const safeTypes=new Set(['bind_existing','create_schedule','create_trial_schedule']);
  return summarizePlan((plan.actions||[]).filter(action=>safeTypes.has(action.type)));
}

async function fetchTenantAccessToken({appId,appSecret}){
  if(!appId||!appSecret)throw new Error('缺少飞书应用 App ID 或 App Secret');
  const res=await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',{
    app_id:appId,
    app_secret:appSecret
  },{timeout:10000});
  if(res.data?.code!==0)throw new Error(`飞书授权失败：${res.data?.msg||res.data?.code}`);
  return res.data.tenant_access_token;
}

async function fetchFeishuSheetValues({spreadsheetToken,sheetId,range,accessToken}){
  const safeRange=range||`${sheetId}!A1:AZ200`;
  const url=`https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${encodeURIComponent(spreadsheetToken)}/values/${encodeURIComponent(safeRange)}`;
  const res=await axios.get(url,{headers:{Authorization:`Bearer ${accessToken}`},params:{valueRenderOption:'ToString'},timeout:15000});
  if(res.data?.code!==0)throw new Error(`读取飞书表失败：${res.data?.msg||res.data?.code}`);
  return res.data?.data?.valueRange?.values||[];
}

async function fetchFeishuSheetMeta({spreadsheetToken,accessToken}){
  const url=`https://open.feishu.cn/open-apis/sheets/v3/spreadsheets/${encodeURIComponent(spreadsheetToken)}/sheets/query`;
  const res=await axios.get(url,{headers:{Authorization:`Bearer ${accessToken}`},timeout:15000});
  if(res.data?.code!==0)throw new Error(`读取飞书表元数据失败：${res.data?.msg||res.data?.code}`);
  const sheets=res.data?.data?.sheets;
  return Array.isArray(sheets)?sheets:(sheets?.sheets||[]);
}

async function sendFeishuWebhook(webhook,text){
  const url=cleanText(webhook);
  if(!url)return {skipped:true};
  await axios.post(url,{msg_type:'text',content:{text}}, {timeout:10000});
  return {sent:true};
}

function cronAuthorized(req){
  const secret=String(process.env.CRON_SECRET||'').trim();
  const auth=String(req.headers.authorization||'');
  const ua=String(req.headers['user-agent']||'');
  if(secret)return auth===`Bearer ${secret}`;
  return /vercel-cron/i.test(ua);
}

function formatActionLine(action){
  const c=action.candidate||{};
  if(action.type==='notify_error')return `失败：${action.reason}（${c.date||''} ${c.startClock||''} ${c.coachName||''} ${c.studentText||''} ${c.sourceCell||''}）`;
  if(action.type==='pending_delete')return `待确认删除：${action.sync?.sourceKey||''}`;
  return `${action.type}：${c.date||''} ${c.startClock||''}-${c.endClock||''} ${c.coachName||''} ${c.studentText||''}`;
}

function buildNotificationText(result){
  const s=result.plan.summary;
  const lines=[
    `飞书排课同步${result.dryRun?' dry-run':'执行'}完成`,
    `新增 ${s.create}，体验课新增 ${s.createTrial}，修改 ${s.update}，绑定 ${s.bindExisting}，删除待确认 ${s.pendingDelete}，异常 ${s.notifyError}`,
    `已忽略历史课 ${result.ignoredPastCount||0} 节`
  ];
  const important=result.plan.actions.filter(a=>a.type!=='noop').slice(0,12).map(formatActionLine);
  if(important.length)lines.push(...important);
  const deleteLinks=(result.applied||[]).filter(item=>item.type==='pending_delete'&&item.confirmUrl).slice(0,8).map(item=>`确认取消：${item.confirmUrl}`);
  if(deleteLinks.length)lines.push(...deleteLinks);
  return lines.join('\n');
}

function isHighRiskScheduleChange(existing={},body={}){
  if(String(existing.courseType||'')!==String(body.courseType||''))return true;
  if(String(existing.experienceType||'')!==String(body.experienceType||''))return true;
  const oldIds=parseMaybeArray(existing.studentIds).map(String).sort();
  const nextIds=parseMaybeArray(body.studentIds).map(String).sort();
  if(oldIds.length!==nextIds.length)return true;
  for(let i=0;i<oldIds.length;i++)if(oldIds[i]!==nextIds[i])return true;
  return false;
}

function findTrialPackage(packages=[],candidate={}){
  const price=candidate.course.experienceType==='青少年'?199:239;
  return (packages||[]).find(row=>{
    const status=cleanText(row.status||'active');
    if(['inactive','off','voided','deleted','下架','作废'].includes(status))return false;
    const rowPrice=Number(row.price||row.packagePrice||row.salePrice||row.systemAmount||0);
    if(rowPrice!==price)return false;
    const text=[row.courseType,row.type,row.name,row.packageName,row.productName,row.experienceType,row.courseTypeLevel2,row.notes].map(cleanText).join(' ');
    return /体验/.test(text);
  })||null;
}

function findLeadMatches(leads=[],name=''){
  const key=normalizeNameKey(name);
  const rows=(leads||[]).filter(row=>{
    if(row.studentId)return false;
    const rowKey=normalizeNameKey(row.name||row.leadName||row.customerName||row.displayName||row.wechatName);
    return rowKey&&key&&(rowKey===key||rowKey.includes(key)||key.includes(rowKey));
  });
  return rows;
}

function buildTrialLeadBody(candidate={}){
  const name=cleanText(candidate.studentNames?.[0]||candidate.studentText);
  return {
    displayName:name,
    wechatName:name,
    phone:'',
    source:'大众点评',
    campus:candidate.campus||'',
    customerType:candidate.course?.audience||candidate.course?.experienceType||'',
    demandProduct:'私教体验课',
    consultType:'私教体验课',
    rawStatus:'已约体验',
    trialAtRaw:candidate.startTime||'',
    profileNote:'',
    createInitialFollowup:true
  };
}

async function resolveTrialStudent(candidate,{leads=[],convertLeadToStudent,createLead}={}){
  if(candidate.resolvedStudents.length)return {student:candidate.resolvedStudents[0],lead:null};
  const matches=findLeadMatches(leads,candidate.studentNames[0]);
  if(matches.length>1)throw new Error(`体验课找到多个相似线索，需要运营确认：${candidate.studentNames.join('、')}`);
  let lead=matches[0]||null;
  if(!lead){
    if(candidate.studentNames.length!==1)throw new Error(`体验课多人或模糊学员需要运营确认：${candidate.studentNames.join('、')}`);
    if(typeof createLead!=='function')throw new Error(`体验课找不到历史学员或唯一线索：${candidate.studentNames.join('、')}`);
    const created=await createLead(buildTrialLeadBody(candidate));
    lead=created?.lead;
    if(!lead?.id)throw new Error('体验课线索创建失败');
  }
  const result=await convertLeadToStudent(lead.id);
  const student=result?.student;
  if(!student?.id)throw new Error('线索转学员失败');
  return {student,lead};
}

async function ensureTrialEntitlement(candidate,{entitlements=[],packages=[],purchasePackage,student}={}){
  const existing=(entitlements||[]).find(row=>{
    if(String(row.studentId||'')!==String(student.id||''))return false;
    if(row.status&&row.status!=='active')return false;
    if(row.courseType!=='体验课')return false;
    if(row.experienceType&&row.experienceType!==candidate.course.experienceType)return false;
    return Number(row.remainingLessons||0)>=1;
  });
  if(existing)return {entitlement:existing,purchase:null};
  const pkg=findTrialPackage(packages,candidate);
  if(!pkg)throw new Error('体验课包商品缺失或价格不是 239/199');
  const purchase=await purchasePackage({
    studentId:student.id,
    packageId:pkg.id,
    purchaseDate:String(candidate.startTime||'').slice(0,10),
    amountPaid:candidate.course.experienceType==='青少年'?199:239,
    payMethod:'大众点评券码',
    operator:'飞书同步'
  });
  return {entitlement:purchase?.entitlement||null,purchase:purchase?.purchase||null};
}

async function applySyncPlan(plan,ctx={}){
  const applied=[];
  const now=new Date().toISOString();
  for(const action of plan.actions){
    try{
      if(action.type==='bind_existing'){
        const row={id:`feishu-sync-${sha256(action.sourceKey).slice(0,24)}`,source:'feishu-sheet',sheetId:action.candidate.sheetId||'',sheetTitle:action.candidate.sheetTitle||'',sourceKey:action.sourceKey,scheduleId:action.schedule.id,startTime:action.candidate.startTime,endTime:action.candidate.endTime,lastFingerprint:action.candidate.fingerprint,status:'active',createdAt:now,updatedAt:now,lastSyncedAt:now};
        await ctx.put(ctx.T_FEISHU_SCHEDULE_SYNC,row.id,row);
        applied.push({type:action.type,sourceKey:action.sourceKey,scheduleId:action.schedule.id});
      }else if(action.type==='create_schedule'){
        const body=buildScheduleBody(action.candidate);
        const result=await ctx.createSchedule(body);
        const schedule=result?.schedule;
        if(!schedule?.id)throw new Error('系统排课创建失败');
        const row={id:`feishu-sync-${sha256(action.sourceKey).slice(0,24)}`,source:'feishu-sheet',sheetId:action.candidate.sheetId||'',sheetTitle:action.candidate.sheetTitle||'',sourceKey:action.sourceKey,scheduleId:schedule.id,startTime:action.candidate.startTime,endTime:action.candidate.endTime,lastFingerprint:action.candidate.fingerprint,status:'active',createdAt:now,updatedAt:now,lastSyncedAt:now};
        await ctx.put(ctx.T_FEISHU_SCHEDULE_SYNC,row.id,row);
        applied.push({type:action.type,sourceKey:action.sourceKey,scheduleId:schedule.id});
      }else if(action.type==='create_trial_schedule'){
        const trial=await resolveTrialStudent(action.candidate,ctx);
        const trialPackage=await ensureTrialEntitlement(action.candidate,{...ctx,student:trial.student});
        const body=buildScheduleBody({...action.candidate,scheduleStudents:[trial.student]},{scheduleStudents:[trial.student],entitlement:trialPackage.entitlement,purchase:trialPackage.purchase,sourceLeadId:trial.lead?.id||'',sourceLeadName:trial.lead?.name||trial.lead?.leadName||''});
        const result=await ctx.createSchedule(body);
        const schedule=result?.schedule;
        if(!schedule?.id)throw new Error('系统体验课排课创建失败');
        const row={id:`feishu-sync-${sha256(action.sourceKey).slice(0,24)}`,source:'feishu-sheet',sheetId:action.candidate.sheetId||'',sheetTitle:action.candidate.sheetTitle||'',sourceKey:action.sourceKey,scheduleId:schedule.id,startTime:action.candidate.startTime,endTime:action.candidate.endTime,lastFingerprint:action.candidate.fingerprint,status:'active',createdAt:now,updatedAt:now,lastSyncedAt:now};
        await ctx.put(ctx.T_FEISHU_SCHEDULE_SYNC,row.id,row);
        applied.push({type:action.type,sourceKey:action.sourceKey,scheduleId:schedule.id});
      }else if(action.type==='update_schedule'){
        const body=buildScheduleBody(action.candidate);
        if(isHighRiskScheduleChange(action.schedule,body)){
          applied.push({type:'notify_error',sourceKey:action.sourceKey,error:'高风险修改需要人工确认'});
          continue;
        }
        const result=await ctx.updateSchedule(action.schedule.id,body);
        const schedule=result?.schedule;
        await ctx.put(ctx.T_FEISHU_SCHEDULE_SYNC,action.sync.id,{...action.sync,lastFingerprint:action.candidate.fingerprint,status:'active',updatedAt:now,lastSyncedAt:now});
        applied.push({type:action.type,sourceKey:action.sourceKey,scheduleId:schedule?.id||action.schedule.id});
      }else if(action.type==='pending_delete'){
        const publicBase=cleanText(process.env.FEISHU_SCHEDULE_PUBLIC_BASE_URL||process.env.STUDENT_REMINDER_PUBLIC_BASE_URL||'https://www.flowtennis.cn').replace(/\/+$/,'');
        const task={id:`feishu-delete-${sha256(`${action.sourceKey}|${now}`).slice(0,24)}`,type:'delete_confirm',sourceKey:action.sourceKey,syncId:action.sync.id,scheduleId:action.sync.scheduleId,status:'pending',createdAt:now,updatedAt:now,expiresAt:new Date(Date.now()+48*3600000).toISOString(),confirmToken:sha256(`${ctx.uuidv4()}|${action.sourceKey}|${now}`)};
        task.confirmUrl=`${publicBase}/api/feishu-schedule-sync/confirm-delete?taskId=${encodeURIComponent(task.id)}&token=${encodeURIComponent(task.confirmToken)}`;
        await ctx.put(ctx.T_FEISHU_SCHEDULE_TASKS,task.id,task);
        await ctx.put(ctx.T_FEISHU_SCHEDULE_SYNC,action.sync.id,{...action.sync,status:'pending_delete',updatedAt:now});
        applied.push({type:action.type,sourceKey:action.sourceKey,taskId:task.id,scheduleId:task.scheduleId,confirmUrl:task.confirmUrl});
      }
    }catch(err){
      applied.push({type:'error',sourceKey:action.sourceKey,error:err.message});
    }
  }
  return applied;
}

function createFeishuScheduleSyncRoutes(deps={}){
  const {
    init,sendJson,sendPlainText,getCachedScan,put,mkTable=async()=>{},uuidv4,
    cancelScheduleById=async()=>{throw new Error('缺少取消排课处理器');},
    createSchedule=async()=>{throw new Error('缺少创建排课处理器');},
    updateSchedule=async()=>{throw new Error('缺少修改排课处理器');},
    convertLeadToStudent=async()=>{throw new Error('缺少线索转学员处理器');},
    createLead=async()=>{throw new Error('缺少创建线索处理器');},
    purchasePackage=async()=>{throw new Error('缺少购买课包处理器');},
    recommendEntitlements=null,
    T_SCHEDULE,T_STUDENTS,T_COACHES,T_USERS,T_PACKAGES,T_ENTITLEMENTS,T_LEADS,T_FEISHU_SCHEDULE_SYNC,T_FEISHU_SCHEDULE_TASKS
  }=deps;

  async function ensureFeishuSyncTables(){
    await Promise.all([T_FEISHU_SCHEDULE_SYNC,T_FEISHU_SCHEDULE_TASKS].filter(Boolean).map(table=>mkTable(table).catch(()=>null)));
  }

  async function loadFeishuCourses(){
    const spreadsheetToken=cleanText(process.env.FEISHU_SCHEDULE_SPREADSHEET_TOKEN);
    const sheetId=cleanText(process.env.FEISHU_SCHEDULE_SHEET_ID||process.env.FEISHU_SCHEDULE_DEFAULT_SHEET_ID);
    if(!spreadsheetToken)throw new Error('缺少 FEISHU_SCHEDULE_SPREADSHEET_TOKEN');
    if(!sheetId)throw new Error('缺少 FEISHU_SCHEDULE_SHEET_ID');
    const accessToken=await fetchTenantAccessToken({
      appId:cleanText(process.env.FEISHU_SCHEDULE_APP_ID),
      appSecret:cleanText(process.env.FEISHU_SCHEDULE_APP_SECRET)
    });
    const [values,meta]=await Promise.all([
      fetchFeishuSheetValues({spreadsheetToken,sheetId,range:process.env.FEISHU_SCHEDULE_RANGE,accessToken}),
      fetchFeishuSheetMeta({spreadsheetToken,accessToken}).catch(()=>[])
    ]);
    const sheet=(meta||[]).find(row=>String(row.sheet_id||'')===sheetId)||{};
    return parseFeishuScheduleRows({values,merges:sheet.merges||[],sheetId,sheetTitle:sheet.title||sheetId});
  }

  async function runSync({dryRun=true,startDate='',endDate='',includeHistorical=false,historyApplyMode=''}={}){
    await init();
    await ensureFeishuSyncTables();
    const [feishuCourses,syncRows,schedules,students,coaches,users,packages,entitlements,leads]=await Promise.all([
      loadFeishuCourses(),
      getCachedScan(T_FEISHU_SCHEDULE_SYNC).catch(()=>[]),
      getCachedScan(T_SCHEDULE).catch(()=>[]),
      getCachedScan(T_STUDENTS).catch(()=>[]),
      getCachedScan(T_COACHES).catch(()=>[]),
      getCachedScan(T_USERS).catch(()=>[]),
      getCachedScan(T_PACKAGES).catch(()=>[]),
      getCachedScan(T_ENTITLEMENTS).catch(()=>[]),
      getCachedScan(T_LEADS).catch(()=>[])
    ]);
    const now=new Date().toISOString();
    const nowKey=chinaDateTimeKey();
    const rangeMode=includeHistorical||!!startDate||!!endDate;
    const selectedCourses=rangeMode
      ? feishuCourses.filter(course=>courseInDateRange(course,startDate,endDate))
      : feishuCourses.filter(course=>isFutureCourse(course,nowKey));
    const selectedScheduleIds=new Set((schedules||[]).filter(row=>rangeMode?courseInDateRange(row,startDate,endDate):isFutureCourse(row,nowKey)).map(row=>String(row.id||'')).filter(Boolean));
    const sheetId=cleanText(process.env.FEISHU_SCHEDULE_SHEET_ID||process.env.FEISHU_SCHEDULE_DEFAULT_SHEET_ID);
    const scopedSyncRows=(syncRows||[]).filter(row=>{
      const rowSheet=cleanText(row.sheetId||String(row.sourceKey||'').split('|')[0]);
      if(sheetId&&rowSheet&&rowSheet!==sheetId)return false;
      return !row.scheduleId||selectedScheduleIds.has(String(row.scheduleId||''));
    });
    const plan=buildDryRunPlan({feishuCourses:selectedCourses,syncRows:rangeMode?[]:scopedSyncRows,schedules,students,coaches,users,entitlements,recommendEntitlements});
    const result={ok:true,dryRun,mode:rangeMode?'date_range':'future',startDate,endDate,at:now,courseCount:selectedCourses.length,totalCourseCount:feishuCourses.length,ignoredPastCount:rangeMode?0:feishuCourses.length-selectedCourses.length,plan};
    if(!dryRun){
      const applyPlan=rangeMode?safeHistoryApplyPlan(plan):plan;
      if(rangeMode&&historyApplyMode!=='safeConfirmed')throw new Error('历史区间写入缺少确认参数 historyApply=safeConfirmed');
      result.applied=await applySyncPlan(applyPlan,{put,uuidv4,createSchedule,updateSchedule,convertLeadToStudent,createLead,purchasePackage,recommendEntitlements,packages,entitlements,leads,T_FEISHU_SCHEDULE_SYNC,T_FEISHU_SCHEDULE_TASKS});
      if(rangeMode)result.historySafeAppliedSummary=applyPlan.summary;
    }
    await sendFeishuWebhook(process.env.FEISHU_SCHEDULE_NOTIFY_WEBHOOK,buildNotificationText(result)).catch(err=>{
      result.notificationError=err.message;
    });
    return result;
  }

  return async function handleFeishuScheduleSyncRoutes({path,method,req,res,query}){
    if(path==='/cron/feishu-schedule-sync'&&method==='GET'){
      if(!cronAuthorized(req))return sendJson(res,{error:'无权限'},403);
      const writeEnabled=String(process.env.FEISHU_SCHEDULE_SYNC_WRITE_ENABLED||'').toLowerCase()==='true';
      const dryRun=query.get('dryRun')==='true'||!writeEnabled;
      const startDate=validDateKey(query.get('startDate'));
      const endDate=validDateKey(query.get('endDate'));
      const includeHistorical=query.get('history')==='true'||!!startDate||!!endDate;
      return sendJson(res,await runSync({dryRun,startDate,endDate,includeHistorical,historyApplyMode:cleanText(query.get('historyApply'))}));
    }
    if(path==='/feishu-schedule-sync/confirm-delete'&&method==='GET'){
      const taskId=cleanText(query.get('taskId'));
      const token=cleanText(query.get('token'));
      await init();
      await ensureFeishuSyncTables();
      const tasks=await getCachedScan(T_FEISHU_SCHEDULE_TASKS).catch(()=>[]);
      const task=(tasks||[]).find(row=>String(row.id)===taskId&&String(row.confirmToken)===token);
      if(!task)return sendPlainText(res,'确认链接无效或已过期',404);
      const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>确认取消排课</title><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:24px;line-height:1.6"><h2>确认取消排课</h2><p>待处理排课 ID：${task.scheduleId||''}</p><p>状态：${task.status||''}</p><form method="post" action="/api/feishu-schedule-sync/confirm-delete?taskId=${encodeURIComponent(task.id)}&token=${encodeURIComponent(task.confirmToken)}"><button style="height:44px;padding:0 18px">确认取消排课</button></form></body>`;
      res.setHeader('Content-Type','text/html; charset=utf-8');
      return res.status(200).send(html);
    }
    if(path==='/feishu-schedule-sync/confirm-delete'&&method==='POST'){
      const taskId=cleanText(query.get('taskId'));
      const token=cleanText(query.get('token'));
      await init();
      await ensureFeishuSyncTables();
      const tasks=await getCachedScan(T_FEISHU_SCHEDULE_TASKS,{fresh:true}).catch(()=>[]);
      const task=(tasks||[]).find(row=>String(row.id)===taskId&&String(row.confirmToken)===token);
      if(!task)return sendJson(res,{error:'确认链接无效或已过期'},404);
      if(task.status!=='pending')return sendJson(res,{error:'该确认任务已处理'},409);
      if(task.expiresAt&&new Date(task.expiresAt).getTime()<Date.now())return sendJson(res,{error:'确认链接已过期'},410);
      const result=await cancelScheduleById(task.scheduleId,'飞书排课表删除确认');
      const now=new Date().toISOString();
      const nextTask={...task,status:'confirmed',confirmedAt:now,updatedAt:now,resultScheduleId:task.scheduleId};
      await put(T_FEISHU_SCHEDULE_TASKS,task.id,nextTask);
      await sendFeishuWebhook(process.env.FEISHU_SCHEDULE_NOTIFY_WEBHOOK,`飞书排课删除已确认并取消系统排课：${task.scheduleId}`).catch(()=>null);
      return sendJson(res,{success:true,task:nextTask,result});
    }
    return false;
  };
}

module.exports={
  cleanText,
  normalizeNameKey,
  parseStudentCell,
  normalizeDateCell,
  parseTimeRange,
  chinaDateTimeKey,
  isFutureCourse,
  validDateKey,
  courseInDateRange,
  applyMergesToValues,
  parseFeishuScheduleRows,
  buildDryRunPlan,
  buildScheduleBody,
  safeHistoryApplyPlan,
  isHighRiskScheduleChange,
  applySyncPlan,
  createFeishuScheduleSyncRoutes
};
