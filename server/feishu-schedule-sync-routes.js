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
  const shared=parseSharedPackageStudentCell(raw);
  if(shared)return shared;
  const lessonIndex=parseLessonIndex(raw);
  const withoutIndex=raw.replace(/[（(]\s*\d+\s*[）)]/g,'').trim();
  const names=normalizeFeishuStudentNames(withoutIndex.split(/[、,，/]+/).map(cleanText).filter(Boolean));
  return {raw,names,lessonIndex};
}

function normalizeStudentNameKey(value){
  return cleanText(value)
    .toLowerCase()
    .replace(/[.·\s]/g,'')
    .replace(/[（(][^）)]*[）)]/g,'')
    .trim();
}

const FEISHU_STUDENT_NAME_ALIASES = Object.freeze({
  [normalizeStudentNameKey('将来')]: '赵新阳',
  [normalizeStudentNameKey('锤锤')]: '是锤锤呀',
  [normalizeStudentNameKey('李俊泽')]: '李俊泽（L¡）',
  [normalizeStudentNameKey('晨曦')]: '曦曦🐳',
  [normalizeStudentNameKey('小土豆的姐姐朋友')]: '小土豆的姐姐的朋友',
  [normalizeStudentNameKey('william弟弟')]: 'william',
  [normalizeStudentNameKey('willliam弟弟')]: 'william'
});

const FEISHU_CONFIRMED_IGNORED_SOURCE_KEYS = new Set([
  'GrbZdi|2026-07-25|16:00|17:30|杨|🐰🐰🐰🐰🐰、🌞艾薇、朋友|零基础训练营体验课|马坡室内|1号'
]);

function parseSharedPackageStudentCell(raw){
  const match=cleanText(raw).match(/^(.+?)[（(]\s*使用\s*(.+?)\s*课包\s*(\d+)?\s*[）)]$/);
  if(!match)return null;
  const attendee=cleanText(match[1]);
  const packageOwner=cleanText(match[2]);
  const lessonIndex=match[3]?parseInt(match[3],10):null;
  return {
    raw,
    names:normalizeFeishuStudentNames([packageOwner]),
    lessonIndex,
    sharedPackageNote:`${attendee}使用${packageOwner}课包${lessonIndex?` ${lessonIndex}`:''}`.trim()
  };
}

function applyConfirmedCourseCorrection(row={},course={},students={}){
  const studentKeys=(students.names||[]).map(normalizeStudentNameKey);
  const rawStudentKey=normalizeStudentNameKey(students.raw||row.studentText||'');
  if(studentKeys.includes(normalizeStudentNameKey('唐果'))&&/私教/.test(cleanText(row.courseText))){
    return {ok:true,raw:course.raw||row.courseText,courseType:'陪打',experienceType:'',audience:'',isTrial:false,payMethod:'储值卡',paidAmount:400,confirmedCorrection:'唐果私教误写按陪打处理'};
  }
  if(/亲子小班/.test(cleanText(row.courseText))&&(studentKeys.includes(normalizeStudentNameKey('晨曦'))||rawStudentKey.includes(normalizeStudentNameKey('晨曦')))){
    return {ok:true,raw:course.raw||row.courseText,courseType:'私教课',experienceType:'',audience:'成人',isTrial:false,confirmedCorrection:'晨曦朋友亲子小班按私教课处理'};
  }
  return course;
}

function normalizeFeishuStudentNames(names=[]){
  const cleaned=(names||[]).map(cleanText).filter(Boolean);
  const keys=cleaned.map(normalizeStudentNameKey);
  if(keys.includes(normalizeStudentNameKey('晨曦'))&&keys.includes(normalizeStudentNameKey('朋友'))){
    return cleaned.filter(name=>normalizeStudentNameKey(name)!==normalizeStudentNameKey('朋友'));
  }
  if(keys.includes(normalizeStudentNameKey('王老板'))){
    return ['王老板'];
  }
  return cleaned;
}

function resolveFeishuStudentAlias(value){
  const raw=cleanText(value);
  return FEISHU_STUDENT_NAME_ALIASES[normalizeStudentNameKey(raw)]||raw;
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
  const special=parseSpecialCourseText(text);
  if(special)return {ok:true,raw:text,courseType:'专项课',experienceType:'',audience:'',isTrial:false,...special};
  const isTrial=/体验/.test(text);
  const audience=/青少|儿童|少儿/.test(text)?'青少年':(/成人/.test(text)?'成人':'');
  if(isTrial&&!audience)return {ok:false,reason:'体验课无法判断成人/青少年',raw:text};
  if(isTrial)return {ok:true,raw:text,courseType:'体验课',experienceType:audience,audience,isTrial:true};
  if(/团课|小班/.test(text)){
    const smallClassType=/亲子/.test(text)?'family':(/训练营|团课/.test(text)?'bootcamp':'single');
    return {ok:true,raw:text,courseType:'小班课',experienceType:'',audience,smallClassType,isTrial:false};
  }
  if(/陪打/.test(text))return {ok:true,raw:text,courseType:'陪打',experienceType:'',audience,isTrial:false};
  if(/私教|正式/.test(text))return {ok:true,raw:text,courseType:'私教课',experienceType:'',audience,isTrial:false};
  return {ok:false,reason:`无法识别课程类型：${text}`,raw:text};
}

function normalizeSkillLevelText(value){
  const raw=cleanText(value).replace(/[～—–~]/g,'-');
  if(/零基础|初阶/.test(raw))return {min:'零基础',max:'零基础'};
  const m=raw.match(/(\d(?:\.\d)?)(?:\s*-\s*(\d(?:\.\d)?))?/);
  if(!m)return {min:'',max:''};
  return {min:m[1],max:m[2]||m[1]};
}

function parseSpecialCourseText(value){
  const text=cleanText(value);
  if(/初阶训练课|初阶专项课/.test(text)){
    return {
      skillLevelMin:'零基础',
      skillLevelMax:'零基础',
      specialTopic:'初阶专项课',
      courseDisplayName:'【零基础】初阶专项课'
    };
  }
  const bracket=text.match(/^【([^】]+)】\s*(.+)$/);
  if(bracket){
    const level=normalizeSkillLevelText(bracket[1]);
    const topic=cleanText(bracket[2]);
    return {
      skillLevelMin:level.min,
      skillLevelMax:level.max,
      specialTopic:topic,
      courseDisplayName:`${level.min&&level.max?`【${level.min===level.max?level.min:`${level.min}-${level.max}`}】`:''}${topic}`
    };
  }
  if(/专项|发接发|击球位置优化|球质提升|多球综合实战特训|优势球识别/.test(text)){
    const level=normalizeSkillLevelText(text);
    const topic=cleanText(text.replace(/【[^】]+】/g,'').replace(/^\d(?:\.\d)?(?:\s*[-～—–~]\s*\d(?:\.\d)?)?/, '').replace(/^王牌专项[:：\s-]*/, ''));
    return {
      skillLevelMin:level.min,
      skillLevelMax:level.max,
      specialTopic:topic||text,
      courseDisplayName:text
    };
  }
  return null;
}

function normalizeSpecialLevelValue(value){
  const raw=cleanText(value);
  if(!raw)return '';
  if(raw==='零基础'||raw==='0'||raw==='0.0')return '零基础';
  const n=Number(raw);
  if(Number.isFinite(n))return n.toFixed(1);
  return raw;
}

function normalizedSpecialTopicKey(value){
  return normalizeNameKey(value).replace(/^专项课/,'');
}

function specialCourseEntitlementMatches(row={},candidate={}){
  if(candidate.course?.courseType!=='专项课')return true;
  const min=normalizeSpecialLevelValue(candidate.course.skillLevelMin);
  const max=normalizeSpecialLevelValue(candidate.course.skillLevelMax||candidate.course.skillLevelMin);
  const rowMin=normalizeSpecialLevelValue(row.skillLevelMin);
  const rowMax=normalizeSpecialLevelValue(row.skillLevelMax||row.skillLevelMin);
  if(min&&rowMin&&rowMin!==min)return false;
  if(max&&rowMax&&rowMax!==max)return false;
  const topic=normalizedSpecialTopicKey(candidate.course.specialTopic||candidate.course.courseDisplayName);
  const rowTopic=normalizedSpecialTopicKey(row.specialTopic||row.courseDisplayName||row.productName||row.packageName||row.name);
  if(topic&&rowTopic&&rowTopic!==topic)return false;
  return true;
}

function candidateEntitlementLessonCount(candidate={}){
  if(['专项课','小班课'].includes(candidate.course?.courseType))return 1;
  return Number(candidate.lessonCount||1);
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

function isLikelySectionCell(cell={}){
  const courseKey=normalizeNameKey(cell.courseText);
  if(courseKey==='蓝色港湾'){
    const filled=[cell.courseText,cell.venueText,cell.courtText,cell.studentText].map(cleanText).filter(Boolean);
    const allSameVenue=filled.length>0&&filled.every(value=>normalizeNameKey(value)==='蓝色港湾');
    if(allSameVenue)return true;
  }
  return false;
}

function parseFeishuScheduleRows({values=[],merges=[],sheetId='',sheetTitle=''}={}){
  const merged=applyMergesToValues(values,merges);
  const {headerRow,blocks}=buildCoachBlocks(merged);
  const cells=[];
  const lastCellByBlock=new Map();
  let currentDate='';
  for(let r=headerRow+1;r<merged.length;r++){
    const row=merged[r]||[];
    const date=normalizeDateCell(row[0])||currentDate;
    if(date)currentDate=date;
    const time=parseTimeRange(row[2]);
    if(!date||!time)continue;
    for(const block of blocks){
      let courseText=cleanText(row[block.courseCol]);
      const studentText=cleanText(row[block.studentCol]);
      let venueText=cleanText(row[block.venueCol]);
      let courtText=cleanText(row[block.courtCol]);
      const prev=lastCellByBlock.get(block.startCol);
      if(!courseText&&studentText&&prev&&prev.date===date&&prev.time.end===time.start&&normalizeNameKey(prev.studentText)===normalizeNameKey(studentText)){
        courseText=prev.courseText;
        venueText=prev.venueText;
        courtText=prev.courtText;
      }
      if(!courseText&&!studentText)continue;
      if(isLikelySectionCell({courseText,venueText,courtText,studentText}))continue;
      const cell={sheetId,sheetTitle,rowIndex:r,colIndex:block.courseCol,date,time,block,courseText,studentText,venueText,courtText};
      cells.push(cell);
      lastCellByBlock.set(block.startCol,cell);
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
    const students=parseStudentCell(row.studentText);
    const course=applyConfirmedCourseCorrection(row,normalizeCourseType(row.courseText),students);
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
      sharedPackageNote:students.sharedPackageNote||'',
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

function normalizeCampusKey(value){
  const text=cleanText(value);
  if(['shunyi_mapo','顺义马坡','马坡','mapo',['ma','bao'].join('')].includes(text))return 'shunyi_mapo';
  return text;
}

function exactScheduleMatch(candidate,schedules=[],options={}){
  const fields=scheduleCandidateFields(candidate);
  const studentSet=new Set(fields.studentIds.map(String));
  return (schedules||[]).find(row=>{
    if(!activeSchedule(row)||!sameTime(fields,row))return false;
    if(normalizeNameKey(row.coach)!==normalizeNameKey(fields.coach))return false;
    if(normalizeCampusKey(row.campus)!==normalizeCampusKey(fields.campus))return false;
    if(!options.ignoreVenue&&String(row.venue||'')!==String(fields.venue||''))return false;
    if(String(row.courseType||'')!==String(fields.courseType||''))return false;
    if(String(row.experienceType||'')!==String(fields.experienceType||''))return false;
    const ids=parseMaybeArray(row.studentIds).map(String);
    return ids.length===studentSet.size&&ids.every(id=>studentSet.has(id));
  })||null;
}

function scheduleMinutes(value){
  const text=cleanText(value);
  const m=text.match(/\d{4}-\d{2}-\d{2}\s+(\d{1,2}):(\d{2})/);
  if(!m)return null;
  return parseInt(m[1],10)*60+parseInt(m[2],10);
}

function contiguousScheduleGroupMatch(candidate,schedules=[],options={}){
  const fields=scheduleCandidateFields(candidate);
  const studentSet=new Set(fields.studentIds.map(String));
  const start=scheduleMinutes(fields.startTime);
  const end=scheduleMinutes(fields.endTime);
  if(start===null||end===null||end<=start)return null;
  const rows=(schedules||[]).filter(row=>{
    if(!activeSchedule(row))return false;
    if(String(row.startTime||'').slice(0,10)!==String(fields.startTime||'').slice(0,10))return false;
    if(normalizeNameKey(row.coach)!==normalizeNameKey(fields.coach))return false;
    if(normalizeCampusKey(row.campus)!==normalizeCampusKey(fields.campus))return false;
    if(!options.ignoreVenue&&String(row.venue||'')!==String(fields.venue||''))return false;
    if(String(row.courseType||'')!==String(fields.courseType||''))return false;
    if(String(row.experienceType||'')!==String(fields.experienceType||''))return false;
    const ids=parseMaybeArray(row.studentIds).map(String);
    if(ids.length!==studentSet.size||!ids.every(id=>studentSet.has(id)))return false;
    const rowStart=scheduleMinutes(row.startTime);
    const rowEnd=scheduleMinutes(row.endTime);
    return rowStart!==null&&rowEnd!==null&&rowStart>=start&&rowEnd<=end&&rowEnd>rowStart;
  }).sort((a,b)=>scheduleMinutes(a.startTime)-scheduleMinutes(b.startTime));
  if(rows.length<2)return null;
  let cursor=start;
  for(const row of rows){
    const rowStart=scheduleMinutes(row.startTime);
    const rowEnd=scheduleMinutes(row.endTime);
    if(rowStart!==cursor)return null;
    cursor=rowEnd;
  }
  if(cursor!==end)return null;
  return {...rows[0],scheduleIds:rows.map(row=>row.id),groupStartTime:fields.startTime,groupEndTime:fields.endTime};
}

function sameDayUniqueScheduleMatch(candidate,schedules=[],options={}){
  const fields=scheduleCandidateFields(candidate);
  const studentSet=new Set(fields.studentIds.map(String));
  const rows=(schedules||[]).filter(row=>{
    if(!activeSchedule(row))return false;
    if(String(row.startTime||'').slice(0,10)!==String(fields.startTime||'').slice(0,10))return false;
    if(normalizeNameKey(row.coach)!==normalizeNameKey(fields.coach))return false;
    if(normalizeCampusKey(row.campus)!==normalizeCampusKey(fields.campus))return false;
    if(!options.ignoreVenue&&String(row.venue||'')!==String(fields.venue||''))return false;
    if(String(row.courseType||'')!==String(fields.courseType||''))return false;
    if(String(row.experienceType||'')!==String(fields.experienceType||''))return false;
    const ids=parseMaybeArray(row.studentIds).map(String);
    return ids.length===studentSet.size&&ids.every(id=>studentSet.has(id));
  });
  return rows.length===1?rows[0]:null;
}

function parseMaybeArray(value){
  if(Array.isArray(value))return value;
  if(typeof value==='string'&&value){
    try{return JSON.parse(value);}catch{return value.split(/[、,，/]+/).map(cleanText).filter(Boolean);}
  }
  return [];
}

function uniqueByName(rows=[],name=''){
  const matched=studentMatchesByName(rows,name);
  return matched.length===1?matched[0]:null;
}

function studentMatchesByName(rows=[],name=''){
  const key=normalizeStudentNameKey(name);
  const candidates=(rows||[]).map(row=>({row,keys:studentNameKeys(row.name||row.studentName||row.leadName)}));
  const exact=candidates.filter(item=>item.keys.includes(key)).map(item=>item.row);
  if(exact.length)return exact;
  const fuzzy=candidates.filter(item=>item.keys.some(itemKey=>itemKey&&key&&(itemKey.includes(key)||key.includes(itemKey)))).map(item=>item.row);
  return fuzzy;
}

function uniqueBySelectableEntitlement(rows=[],candidate,ctx={}){
  const matched=(rows||[]).filter(student=>hasSelectableEntitlement(student,candidate,ctx.entitlements,ctx.recommendEntitlements));
  if(matched.length===1)return matched[0];
  const matchedIgnoringIndex=(rows||[]).filter(student=>hasSelectableEntitlementIgnoringLessonIndex(student,candidate,ctx.entitlements,ctx.recommendEntitlements));
  return matchedIgnoringIndex.length===1?matchedIgnoringIndex[0]:null;
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
  const allowSingleSmallClass=confirmedSingleStudentSmallClass(raw);
  if(raw.course.courseType==='小班课'&&['bootcamp','family'].includes(raw.course.smallClassType)&&raw.studentNames.length<2&&!allowSingleSmallClass)errors.push('小班课至少 2 人到场才能开课，需要运营确认');
  const resolvedStudents=[];
  const unresolvedStudents=[];
  const studentAliasMap={};
  for(const name of raw.studentNames){
    const lookupName=resolveFeishuStudentAlias(name);
    if(lookupName!==name)studentAliasMap[name]=lookupName;
    const lookupMatches=studentMatchesByName(ctx.students,lookupName);
    const rawMatches=lookupName===name?[]:studentMatchesByName(ctx.students,name);
    const candidates=[...lookupMatches,...rawMatches].filter((row,index,all)=>row?.id&&all.findIndex(item=>String(item.id)===String(row.id))===index);
    const confirmedAliasStudent=lookupName!==name&&lookupMatches.length===1?lookupMatches[0]:null;
    const student=confirmedAliasStudent||(candidates.length===1?candidates[0]:uniqueBySelectableEntitlement(candidates,raw,ctx))||uniqueByName(ctx.students,lookupName)||uniqueByName(ctx.students,name);
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
  return {...raw,resolvedCoach,resolvedStudents,unresolvedStudents,studentAliasMap,errors};
}

function confirmedSingleStudentSmallClass(raw={}){
  if(raw.course?.courseType!=='小班课')return false;
  const text=cleanText(raw.studentText||raw.studentNames?.join('、'));
  const names=Array.isArray(raw.studentNames)?raw.studentNames:[];
  const keys=[...names,...text.split(/[、,，/&]+/)].map(name=>normalizeStudentNameKey(resolveFeishuStudentAlias(name)));
  if(keys.includes(normalizeStudentNameKey('王老板')))return true;
  if(keys.includes(normalizeStudentNameKey('笑逐')))return true;
  return keys.includes(normalizeStudentNameKey('曦曦🐳'))&&keys.includes(normalizeStudentNameKey('朋友'));
}

function hasSelectableEntitlement(student,candidate,entitlements=[],recommendEntitlements){
  return !!selectEntitlementForStudent(student,candidate,entitlements,recommendEntitlements);
}

function selectEntitlementForStudent(student,candidate,entitlements=[],recommendEntitlements){
  if(!student?.id)return null;
  const body=buildScheduleBody({...candidate,scheduleStudents:[student]});
  const rows=(entitlements||[]).filter(row=>String(row.studentId||'')===String(student.id||'')&&specialCourseEntitlementMatches(row,candidate));
  if(typeof recommendEntitlements==='function'){
    const result=recommendEntitlements(rows,body);
    if(!result?.recommended)return null;
    const selected=rows.find(row=>String(row.id||'')===String(result.recommended.entitlementId||result.recommended.id||''));
    return selected&&entitlementLessonIndexMatches(selected,candidate)?selected:null;
  }
  return rows.find(row=>{
    if(row.status&&row.status!=='active')return false;
    if(row.courseType&&row.courseType!==candidate.course.courseType)return false;
    if(row.experienceType&&candidate.course.experienceType&&row.experienceType!==candidate.course.experienceType)return false;
    if(!specialCourseEntitlementMatches(row,candidate))return false;
    if(!entitlementLessonIndexMatches(row,candidate))return false;
    return Number(row.remainingLessons||0)>=candidateEntitlementLessonCount(candidate);
  })||null;
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
  if(expected===null)return false;
  if(expected===index)return true;
  const total=Number(row.totalLessons);
  if(Number.isFinite(total)&&total>=20&&total%10===0&&expected>10){
    return ((expected-1)%10)+1===index;
  }
  return false;
}

function entitlementCourseMatches(row={},candidate={}){
  if(row.status&&row.status!=='active')return false;
  if(row.courseType&&row.courseType!==candidate.course.courseType)return false;
  if(row.experienceType&&candidate.course.experienceType&&row.experienceType!==candidate.course.experienceType)return false;
  if(!specialCourseEntitlementMatches(row,candidate))return false;
  return Number(row.remainingLessons||0)>=candidateEntitlementLessonCount(candidate);
}

function hasSelectableEntitlementIgnoringLessonIndex(student,candidate,entitlements=[],recommendEntitlements){
  return hasSelectableEntitlement(student,{...candidate,lessonIndex:null},entitlements,recommendEntitlements);
}

function lessonIndexMismatchDetails(candidate,ctx={}){
  const index=Number(candidate.lessonIndex);
  if(!Number.isFinite(index)||index<=0)return '';
  const details=[];
  for(const student of candidate.resolvedStudents||[]){
    const rows=(ctx.entitlements||[]).filter(row=>String(row.studentId||'')===String(student.id||''));
    let candidates=[];
    if(typeof ctx.recommendEntitlements==='function'){
      const result=ctx.recommendEntitlements(rows,buildScheduleBody({...candidate,lessonIndex:null,scheduleStudents:[student]}));
      const selected=rows.find(row=>String(row.id||'')===String(result?.recommended?.entitlementId||result?.recommended?.id||''));
      if(selected)candidates=[selected];
    }else{
      candidates=rows.filter(row=>entitlementCourseMatches(row,candidate));
    }
    candidates
      .filter(row=>!entitlementLessonIndexMatches(row,candidate))
      .slice(0,2)
      .forEach(row=>{
        const expected=entitlementExpectedLessonIndex(row);
        if(expected===null)return;
        const packageName=cleanText(row.packageName||row.name||row.productName||'可用课包');
        details.push(`${student.name||student.id}：飞书第${index}节，系统下一节第${expected}节，课包「${packageName}」`);
      });
  }
  return details.join('；');
}

function attachSchedulableStudents(candidate,ctx={}){
  if(candidate.errors.length)return candidate;
  if(candidate.course.isTrial)return {...candidate,scheduleStudents:candidate.resolvedStudents.slice(0,1)};
  if(candidate.course.courseType==='陪打')return {...candidate,scheduleStudents:candidate.resolvedStudents.slice(0,1)};
  const selectedEntitlements=[];
  const scheduleStudents=candidate.resolvedStudents.filter(student=>{
    const selected=selectEntitlementForStudent(student,candidate,ctx.entitlements,ctx.recommendEntitlements);
    if(selected){
      selectedEntitlements.push(selected);
      return true;
    }
    return false;
  });
  if(!scheduleStudents.length){
    const hasPackageWithMismatchedIndex=Number(candidate.lessonIndex)>0&&candidate.resolvedStudents.some(student=>hasSelectableEntitlementIgnoringLessonIndex(student,candidate,ctx.entitlements,ctx.recommendEntitlements));
    if(hasPackageWithMismatchedIndex){
      const detail=lessonIndexMismatchDetails(candidate,ctx);
      return {...candidate,scheduleStudents:[],errors:[...candidate.errors,`飞书括号课时编号和系统课包进度不一致，需要运营确认${detail?`：${detail}`:''}`]};
    }
    return {...candidate,scheduleStudents:[],errors:[...candidate.errors,'没有可自动扣课的可用课包']};
  }
  return {...candidate,scheduleStudents,selectedEntitlements};
}

function buildDryRunPlan({feishuCourses=[],syncRows=[],schedules=[],students=[],coaches=[],users=[],entitlements=[],recommendEntitlements=null,nowKey=''}={}){
  const ctx={students,coaches,users,schedules,entitlements,recommendEntitlements};
  const ignoredByKey=new Map((syncRows||[]).filter(row=>row.status==='ignored').map(row=>[String(row.sourceKey||''),row]));
  const syncByKey=new Map((syncRows||[]).filter(row=>row.status!=='ignored').map(row=>[String(row.sourceKey||''),row]));
  const activeSourceKeys=new Set();
  const actions=[];
  for(const raw of feishuCourses){
    if(FEISHU_CONFIRMED_IGNORED_SOURCE_KEYS.has(String(raw.sourceKey||''))){
      activeSourceKeys.add(raw.sourceKey);
      actions.push({type:'noop',sourceKey:raw.sourceKey,candidate:raw,sync:{status:'ignored',sourceKey:raw.sourceKey}});
      continue;
    }
    const ignored=ignoredByKey.get(String(raw.sourceKey||''));
    if(ignored){
      activeSourceKeys.add(raw.sourceKey);
      actions.push({type:'noop',sourceKey:raw.sourceKey,candidate:raw,sync:ignored});
      continue;
    }
    let candidate=buildResolvedCandidate(raw,ctx);
    const historicalCourse=!!nowKey&&!isFutureCourse(candidate,nowKey);
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
        if(historicalCourse){
          actions.push({type:'notify_error',sourceKey:candidate.sourceKey,candidate,sync,schedule:existing,reason:'历史排课修改需要运营确认'});
          continue;
        }
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
    const contiguous=contiguousScheduleGroupMatch(candidate,schedules);
    if(contiguous){
      actions.push({type:'bind_existing',sourceKey:candidate.sourceKey,candidate,schedule:contiguous,scheduleIds:contiguous.scheduleIds});
      continue;
    }
    const systemVenueMatch=exactScheduleMatch(candidate,schedules,{ignoreVenue:true});
    if(systemVenueMatch){
      actions.push({type:'bind_existing',sourceKey:candidate.sourceKey,candidate,schedule:systemVenueMatch,venueSource:'system'});
      continue;
    }
    const systemVenueGroupMatch=contiguousScheduleGroupMatch(candidate,schedules,{ignoreVenue:true});
    if(systemVenueGroupMatch){
      actions.push({type:'bind_existing',sourceKey:candidate.sourceKey,candidate,schedule:systemVenueGroupMatch,scheduleIds:systemVenueGroupMatch.scheduleIds,venueSource:'system'});
      continue;
    }
    if(historicalCourse){
      const sameDayMatch=sameDayUniqueScheduleMatch(candidate,schedules);
      if(sameDayMatch){
        actions.push({type:'bind_existing',sourceKey:candidate.sourceKey,candidate,schedule:sameDayMatch,timeSource:'system'});
        continue;
      }
      const systemVenueSameDayMatch=sameDayUniqueScheduleMatch(candidate,schedules,{ignoreVenue:true});
      if(systemVenueSameDayMatch){
        actions.push({type:'bind_existing',sourceKey:candidate.sourceKey,candidate,schedule:systemVenueSameDayMatch,timeSource:'system',venueSource:'system'});
        continue;
      }
    }
    candidate=attachSchedulableStudents(candidate,ctx);
    if(candidate.errors.length){
      actions.push({type:'notify_error',sourceKey:candidate.sourceKey,candidate,reason:candidate.errors.join('；')});
      continue;
    }
    if(historicalCourse){
      actions.push({type:'notify_error',sourceKey:candidate.sourceKey,candidate,reason:'历史排课缺少系统绑定，需要运营确认后补建'});
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
  const isCompanion=courseType==='陪打';
  const smallClassType=courseType==='小班课'?(candidate.course.smallClassType||'single'):'';
  const smallClassLevel2=smallClassType==='bootcamp'?'训练营':(smallClassType==='family'?'亲子课':(smallClassType==='dropin'?'随到随学':'单次'));
  const studentName=scheduleStudents.map(row=>row.name||row.id).join('、');
  const locationType=candidate.locationType==='external'?'external':'own';
  const entitlement=extra.entitlement||{};
  const purchase=extra.purchase||{};
  const selectedEntitlements=Array.isArray(candidate.selectedEntitlements)?candidate.selectedEntitlements:[];
  const selectedEntitlementIds=selectedEntitlements.map(row=>row.id).filter(Boolean);
  const entitlementId=extra.entitlementId||entitlement.id||(selectedEntitlementIds.length===1?selectedEntitlementIds[0]:'');
  const explicitEntitlementIds=Array.isArray(extra.entitlementIds)?extra.entitlementIds.filter(Boolean):[];
  const entitlementIds=explicitEntitlementIds.length?explicitEntitlementIds:(selectedEntitlementIds.length?selectedEntitlementIds:(entitlementId?[entitlementId]:[]));
  return {
    startTime:candidate.startTime,
    endTime:candidate.endTime,
    studentIds:scheduleStudents.map(row=>row.id),
    expectedStudentIds:scheduleStudents.map(row=>row.id),
    absentStudentIds:[],
    studentName,
    courseType,
    experienceType,
    skillLevelMin:candidate.course.skillLevelMin||'',
    skillLevelMax:candidate.course.skillLevelMax||'',
    specialTopic:candidate.course.specialTopic||'',
    courseDisplayName:candidate.course.courseDisplayName||candidate.course.raw||courseType,
    courseTypeLevel2:isTrial?`${experienceType}体验课`:(courseType==='小班课'?smallClassLevel2:(courseType==='专项课'?'':(courseType==='陪打'?'陪打':`${candidate.course.audience||''}私教课`))),
    standardCourseType:isTrial?`${experienceType}私教【体验】`:(courseType==='小班课'?`${candidate.course.audience||''}小班课/${smallClassLevel2}`:(courseType==='专项课'?'专项课':(courseType==='陪打'?'陪打':`${candidate.course.audience||''}私教【正式】`))),
    isTrial,
    smallClassType,
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
    settlementType:isCompanion?'direct':'package',
    payMethod:isCompanion?(candidate.course.payMethod||'待确认'):'',
    paidAmount:isCompanion?Number(candidate.course.paidAmount||100):0,
    entitlementId,
    entitlementIds,
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
    notes:[candidate.sharedPackageNote,`飞书排课表同步 ${candidate.sheetTitle||candidate.sheetId||''} ${candidate.sourceCell||''}`.trim()].filter(Boolean).join('；')
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

function safeHistoryApplyPlan(plan={},options={}){
  const safeTypes=new Set(['bind_existing','create_schedule']);
  if(options.includeTrial===true)safeTypes.add('create_trial_schedule');
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
  const rawRange=cleanText(range);
  const safeRange=rawRange
    ? (rawRange.includes('!')?`${sheetId}!${rawRange.split('!').slice(1).join('!')}`:`${sheetId}!${rawRange}`)
    : `${sheetId}!A1:AZ200`;
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

function chinaTodayKey(now=new Date()){
  const parts=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const pick=type=>parts.find(part=>part.type===type)?.value||'';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

function sheetTitleDateRange(title='',todayKey=chinaTodayKey()){
  const text=cleanText(title).replace(/[～—–~至]/g,'-');
  const m=text.match(/(\d{1,2})[.月/-](\d{1,2})(?:日)?\s*-\s*(?:(\d{1,2})[.月/-])?(\d{1,2})(?:日)?/);
  if(!m)return null;
  const todayYear=Number(String(todayKey).slice(0,4));
  const startMonth=Number(m[1]);
  const startDay=Number(m[2]);
  const endMonth=Number(m[3]||m[1]);
  const endDay=Number(m[4]);
  if(!startMonth||!startDay||!endMonth||!endDay)return null;
  const endYear=endMonth<startMonth?todayYear+1:todayYear;
  return {
    start:`${todayYear}-${String(startMonth).padStart(2,'0')}-${String(startDay).padStart(2,'0')}`,
    end:`${endYear}-${String(endMonth).padStart(2,'0')}-${String(endDay).padStart(2,'0')}`
  };
}

function sheetTitleIncludesDate(sheet={},todayKey=chinaTodayKey()){
  const range=sheetTitleDateRange(sheet.title||'',todayKey);
  return !!range&&todayKey>=range.start&&todayKey<=range.end;
}

function selectFeishuScheduleSheet(meta=[],configuredSheetId='',todayKey=chinaTodayKey()){
  const sheets=Array.isArray(meta)?meta:[];
  const configured=cleanText(configuredSheetId);
  const configuredSheet=sheets.find(row=>String(row.sheet_id||'')===configured)||null;
  if(configuredSheet&&sheetTitleIncludesDate(configuredSheet,todayKey))return configuredSheet;
  return sheets.find(row=>sheetTitleIncludesDate(row,todayKey))||configuredSheet||sheets[0]||null;
}

async function sendFeishuWebhook(webhook,text){
  const url=cleanText(webhook);
  if(!url)return {skipped:true};
  const res=await axios.post(url,{msg_type:'text',content:{text}}, {timeout:10000});
  const code=Number(res.data?.code??0);
  if(code!==0)throw new Error(`飞书群通知失败：${res.data?.msg||code}`);
  return {sent:true,code};
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
  if(action.type==='notify_error')return `${formatCourseBrief(c)}：${operatorActionText(action.reason)}`;
  if(action.type==='pending_delete')return `待确认删除：系统排课 ${action.sync?.scheduleId||''}`;
  return `${action.type}：${c.date||''} ${c.startClock||''}-${c.endClock||''} ${c.coachName||''} ${c.studentText||''}`;
}

function formatCourseBrief(candidate={}){
  const date=cleanText(candidate.date||String(candidate.startTime||'').slice(0,10));
  const time=cleanText(candidate.startClock||String(candidate.startTime||'').slice(11,16));
  const student=cleanText(candidate.studentText||candidate.studentNames?.join('、'));
  const course=cleanText(candidate.courseText||candidate.course?.raw||candidate.course?.courseType);
  const coach=cleanText(candidate.coachName||candidate.resolvedCoach?.name);
  const venue=[candidate.venueText,candidate.courtText||candidate.venue].map(cleanText).filter(Boolean).join(' ');
  return [date,time,student,course,coach,venue].filter(Boolean).join('｜');
}

function operatorActionText(reason=''){
  const text=cleanText(reason);
  if(/课时编号|系统课包进度/.test(text)){
    const detail=text.includes('：')?text.split('：').slice(1).join('：'):'';
    return `请确认按飞书还是按系统扣${detail?`；${detail}`:''}`;
  }
  if(/无法唯一识别.*学员/.test(text))return '建议新增/绑定学员档案；没有档案请确认是否按线索转学员建档';
  if(/没有可自动扣课/.test(text))return '课包余额不足或类型不匹配；请确认购买/补录哪个课包';
  if(/体验课无法判断/.test(text))return '请把飞书学员写成 姓名【体验-成人/青少年】 或 姓名【正式】';
  if(/历史排课缺少系统绑定/.test(text))return '请确认是否补建历史排课；确认后走专项修复';
  if(/历史排课修改/.test(text))return '请确认是否修改历史排课；确认后走专项修复';
  if(/缺少课程类型|缺少场馆|缺少场地号/.test(text))return '请补齐飞书表课程类型、场馆、场地';
  if(/小班课至少/.test(text))return '请确认是否单人也开课，或补齐同场学员';
  return text||'请运营确认';
}

function buildNotificationText(result){
  const s=result.plan.summary;
  const lines=[
    `网球兄弟小助手 排课日报：飞书排课同步${result.dryRun?' dry-run':'执行'}完成（当日上课情况 / 次日排课情况）`,
    `本次处理：新增 ${s.create}，体验课新增 ${s.createTrial}，修改 ${s.update}，绑定 ${s.bindExisting}，删除待确认 ${s.pendingDelete}`,
    `历史待清账：${s.notifyError} 条`
  ];
  const important=result.plan.actions.filter(a=>a.type!=='noop');
  if(important.length){
    lines.push('需要运营处理：');
    lines.push(...important.slice(0,10).map(formatActionLine));
    if(important.length>10)lines.push(`其余 ${important.length-10} 条请看同步结果报告，不在群里刷屏。`);
  }
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
        const scheduleIds=Array.isArray(action.scheduleIds)&&action.scheduleIds.length?action.scheduleIds:[action.schedule.id];
        const row={id:`feishu-sync-${sha256(action.sourceKey).slice(0,24)}`,source:'feishu-sheet',sheetId:action.candidate.sheetId||'',sheetTitle:action.candidate.sheetTitle||'',sourceKey:action.sourceKey,scheduleId:action.schedule.id,scheduleIds,startTime:action.candidate.startTime,endTime:action.candidate.endTime,lastFingerprint:action.candidate.fingerprint,status:'active',createdAt:now,updatedAt:now,lastSyncedAt:now};
        await ctx.put(ctx.T_FEISHU_SCHEDULE_SYNC,row.id,row);
        applied.push({type:action.type,sourceKey:action.sourceKey,scheduleId:action.schedule.id,scheduleIds});
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
    const meta=await fetchFeishuSheetMeta({spreadsheetToken,accessToken}).catch(()=>[]);
    const sheet=selectFeishuScheduleSheet(meta,sheetId);
    const selectedSheetId=cleanText(sheet?.sheet_id||sheetId);
    const values=await fetchFeishuSheetValues({spreadsheetToken,sheetId:selectedSheetId,range:process.env.FEISHU_SCHEDULE_RANGE,accessToken});
    const courses=parseFeishuScheduleRows({values,merges:sheet?.merges||[],sheetId:selectedSheetId,sheetTitle:sheet?.title||selectedSheetId});
    return {courses,sheetId:selectedSheetId,sheetTitle:sheet?.title||selectedSheetId};
  }

  async function runSync({dryRun=true,startDate='',endDate='',includeHistorical=false,historyApplyMode='',historyTrialMode='',notifyDryRun=false,suppressNotification=false}={}){
    await init();
    await ensureFeishuSyncTables();
    const [feishuSheet,syncRows,schedules,students,coaches,users,packages,entitlements,leads]=await Promise.all([
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
    const feishuCourses=feishuSheet.courses||[];
    const now=new Date().toISOString();
    const nowKey=chinaDateTimeKey();
    const rangeMode=includeHistorical||!!startDate||!!endDate;
    const selectedCourses=rangeMode
      ? feishuCourses.filter(course=>courseInDateRange(course,startDate,endDate))
      : feishuCourses;
    const selectedScheduleIds=new Set((schedules||[]).filter(row=>rangeMode?courseInDateRange(row,startDate,endDate):true).map(row=>String(row.id||'')).filter(Boolean));
    const sheetId=cleanText(feishuSheet.sheetId||process.env.FEISHU_SCHEDULE_SHEET_ID||process.env.FEISHU_SCHEDULE_DEFAULT_SHEET_ID);
    const scopedSyncRows=(syncRows||[]).filter(row=>{
      const rowSheet=cleanText(row.sheetId||String(row.sourceKey||'').split('|')[0]);
      if(sheetId&&rowSheet&&rowSheet!==sheetId)return false;
      if(!rangeMode)return true;
      return !row.scheduleId||selectedScheduleIds.has(String(row.scheduleId||''));
    });
    const plan=buildDryRunPlan({feishuCourses:selectedCourses,syncRows:rangeMode?[]:scopedSyncRows,schedules,students,coaches,users,entitlements,recommendEntitlements,nowKey});
    const result={ok:true,dryRun,mode:rangeMode?'date_range':'sheet',sheetId,sheetTitle:feishuSheet.sheetTitle||sheetId,startDate,endDate,at:now,courseCount:selectedCourses.length,totalCourseCount:feishuCourses.length,ignoredPastCount:0,plan};
    if(!dryRun){
      const applyPlan=rangeMode?safeHistoryApplyPlan(plan,{includeTrial:historyTrialMode==='confirmed'}):plan;
      if(rangeMode&&historyApplyMode!=='safeConfirmed')throw new Error('历史区间写入缺少确认参数 historyApply=safeConfirmed');
      result.applied=await applySyncPlan(applyPlan,{put,uuidv4,createSchedule,updateSchedule,convertLeadToStudent,createLead,purchasePackage,recommendEntitlements,packages,entitlements,leads,T_FEISHU_SCHEDULE_SYNC,T_FEISHU_SCHEDULE_TASKS});
      if(rangeMode)result.historySafeAppliedSummary=applyPlan.summary;
    }
    if(suppressNotification){
      result.notification={skipped:true,reason:'本次执行已按参数关闭群通知'};
    }else if(dryRun&&!notifyDryRun){
      result.notification={skipped:true,reason:'dry-run 默认不发群'};
    }else{
      try{
        result.notification=await sendFeishuWebhook(process.env.FEISHU_SCHEDULE_NOTIFY_WEBHOOK,buildNotificationText(result));
      }catch(err){
        result.notification={sent:false,error:err.message};
        result.notificationError=err.message;
      }
    }
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
      return sendJson(res,await runSync({dryRun,startDate,endDate,includeHistorical,historyApplyMode:cleanText(query.get('historyApply')),historyTrialMode:cleanText(query.get('historyTrial')),notifyDryRun:query.get('notify')==='true',suppressNotification:query.get('notify')==='false'||query.get('silent')==='true'}));
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
      await sendFeishuWebhook(process.env.FEISHU_SCHEDULE_NOTIFY_WEBHOOK,`网球兄弟小助手 排课日报：飞书排课删除已确认并取消系统排课：${task.scheduleId}`).catch(()=>null);
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
  sheetTitleDateRange,
  selectFeishuScheduleSheet,
  applyMergesToValues,
  parseFeishuScheduleRows,
  buildDryRunPlan,
  buildScheduleBody,
  safeHistoryApplyPlan,
  isHighRiskScheduleChange,
  applySyncPlan,
  createFeishuScheduleSyncRoutes
};
