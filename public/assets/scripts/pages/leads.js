let leadImportState={fileName:'',fileSize:0,fileModified:0,csvText:'',previewRows:[],summary:null,error:''};
let leadDatePreset='all',leadDateCustomStart='',leadDateCustomEnd='';
function leadRawRows(){
  return Array.isArray(leads)?leads:[];
}
function leadIdentityName(value){
  return String(value||'').trim().replace(/1[3-9]\d{9}/g,'').toLowerCase().replace(/\s+/g,'').replace(/[·.。_\-\/|｜，,;；]/g,'');
}
function leadDedupPhone(lead){
  const direct=String(lead?.phone||'').replace(/\s+/g,'').trim();
  if(direct)return direct;
  const match=String(lead?.displayName||lead?.wechatName||lead?.name||'').match(/1[3-9]\d{9}/);
  return match?match[0]:'';
}
function leadDedupText(value){
  return String(value||'').trim().toLowerCase().replace(/\s+/g,'');
}
function leadDedupDate(value,lead={}){
  return leadDateOnly(value,lead)||String(value||'').trim();
}
function leadFollowupDateText(item){
  return leadDateOnly(item?.followupAt||item?.createdAt)||String(item?.followupAt||item?.createdAt||'').slice(0,10)||'-';
}
function leadFollowupPersonText(item){
  return String(item?.followupBy||'未填写').replace(/^@+/,'').trim()||'未填写';
}
function leadFollowupNoteText(item){
  const note=String(item?._mergedFollowupNote||item?.communicationNote||'').trim();
  const conclusion=String(item?.conclusion||'').trim();
  if(note&&conclusion&&leadDedupText(note)!==leadDedupText(conclusion)&&!leadDedupText(note).includes(leadDedupText(conclusion)))return `${note}；${conclusion}`;
  return note||conclusion||'-';
}
function leadMergeFollowupNotes(items){
  const texts=(items||[]).map(leadFollowupNoteText).filter(text=>text&&text!=='-').sort((a,b)=>b.length-a.length);
  const merged=[];
  texts.forEach(text=>{
    const key=leadDedupText(text);
    if(!key)return;
    if(merged.some(item=>{
      const existing=leadDedupText(item);
      return existing.includes(key)||key.includes(existing);
    }))return;
    merged.push(text);
  });
  return merged.join('；')||'-';
}
function leadFollowupNotesOverlap(a,b){
  const ak=leadDedupText(leadFollowupNoteText(a));
  const bk=leadDedupText(leadFollowupNoteText(b));
  return !!(ak&&bk&&(ak===bk||ak.includes(bk)||bk.includes(ak)));
}
function leadMergeFollowupGroup(items){
  const rows=Array.isArray(items)?items:[];
  const mergedNote=leadMergeFollowupNotes(rows);
  const base=[...rows].sort((a,b)=>leadFollowupNoteText(b).length-leadFollowupNoteText(a).length)[0]||{};
  const personRow=rows.find(item=>leadFollowupPersonText(item)!=='未填写')||base;
  const convertedRow=rows.find(item=>leadFollowupConvertedText(item)==='已转化')||base;
  return {
    ...base,
    followupAt:leadFollowupDateText(base),
    followupBy:leadFollowupPersonText(personRow),
    statusAfter:convertedRow?.statusAfter||base?.statusAfter||'',
    _mergedFollowupNote:mergedNote
  };
}
function leadFollowupDateGroupKey(item){
  return [
    item?.leadId||'',
    leadFollowupDateText(item)
  ].join('|');
}
function leadDedupKey(lead){
  const phone=leadDedupPhone(lead);
  const name=leadIdentityName(lead?.displayName||lead?.wechatName||lead?.name);
  const identity=phone?`phone:${phone}`:(name?`name:${name}`:`id:${String(lead?.id||'')}`);
  return [
    identity,
    leadDedupDate(lead?.leadDate,lead),
    leadDedupText(lead?.source),
    leadDedupText(lead?.consultType)
  ].join('|');
}
function leadCanonicalNameKey(lead){
  const name=leadIdentityName(lead?.wechatName||lead?.displayName||lead?.name);
  return name?`name:${name}`:`id:${String(lead?.id||'')}`;
}
function leadMergeDateValue(value,lead={}){
  const date=leadDateOnly(value,lead);
  const parsed=Date.parse(date||value||'');
  return Number.isFinite(parsed)?parsed:Number.MAX_SAFE_INTEGER;
}
function mergeLeadRows(rows=[]){
  const list=(rows||[]).filter(Boolean);
  if(!list.length)return null;
  const primary=[...list].sort((a,b)=>leadMergeDateValue(a?.leadDate,a)-leadMergeDateValue(b?.leadDate,b)||String(a?.createdAt||'').localeCompare(String(b?.createdAt||''))||String(a?.id||'').localeCompare(String(b?.id||'')))[0];
  const latest=[...list].sort((a,b)=>String(b?.updatedAt||b?.lastFollowupAt||b?.createdAt||'').localeCompare(String(a?.updatedAt||a?.lastFollowupAt||a?.createdAt||'')));
  const merged={...primary};
  latest.reverse().forEach(row=>{
    Object.entries(row||{}).forEach(([key,value])=>{
      if(['id','createdAt','leadDate'].includes(key))return;
      if(String(value??'').trim())merged[key]=value;
    });
  });
  merged.id=primary.id;
  merged.createdAt=primary.createdAt;
  merged.leadDate=primary.leadDate;
  merged.updatedAt=latest[0]?.updatedAt||primary.updatedAt||'';
  merged.lastFollowupAt=latest.map(row=>String(row?.lastFollowupAt||'').trim()).filter(Boolean).sort().pop()||merged.lastFollowupAt||'';
  merged._mergedLeadIds=Array.from(new Set(list.map(row=>String(row?.id||'').trim()).filter(Boolean)));
  return merged;
}
function mergeDuplicateLeadRows(rows=[]){
  const groups=new Map();
  (rows||[]).forEach(row=>{
    const key=leadCanonicalNameKey(row);
    const group=groups.get(key)||[];
    group.push(row);
    groups.set(key,group);
  });
  return Array.from(groups.values()).map(mergeLeadRows).filter(Boolean);
}
function leadWechatText(lead){
  return String(lead?.wechatName||lead?.displayName||'-').trim()||'-';
}
function leadRows(){
  return mergeDuplicateLeadRows(leadRawRows()).sort((a,b)=>{
    const leadDateDiff=leadSortDateValue(b?.leadDate,b)-leadSortDateValue(a?.leadDate,a);
    if(leadDateDiff!==0)return leadDateDiff;
    return String(b?.createdAt||b?.id||'').localeCompare(String(a?.createdAt||a?.id||''));
  });
}
function leadMergedIds(leadRef){
  const lead=typeof leadRef==='object'?leadRef:leadRows().find(item=>String(item?.id||'')===String(leadRef));
  const ids=lead?lead._mergedLeadIds:[leadRef];
  return new Set((Array.isArray(ids)?ids:[lead?.id||leadRef]).map(id=>String(id||'')).filter(Boolean));
}
function leadFollowupRows(leadRef){
  const ids=leadMergedIds(leadRef);
  return (Array.isArray(leadFollowups)?leadFollowups:[])
    .filter(item=>ids.has(String(item?.leadId||'')))
    .sort((a,b)=>leadSortDateValue(b?.followupAt||b?.createdAt||'')-leadSortDateValue(a?.followupAt||a?.createdAt||'')||String(b?.createdAt||b?.id||'').localeCompare(String(a?.createdAt||a?.id||'')));
}
function leadById(leadId){
  return leadRows().find(item=>String(item?.id||'')===String(leadId))||leadRawRows().find(item=>String(item?.id||'')===String(leadId))||null;
}
function leadDisplayName(lead){
  return String(lead?.displayName||lead?.name||lead?.wechatName||lead?.phone||'未命名线索').trim();
}
function leadSystemStatusText(lead){
  return String(lead?.systemStatus||lead?.rawStatus||'跟进中').trim()||'跟进中';
}
function leadFollowupStatusText(lead){
  return String(lead?.rawStatus||lead?.systemStatus||'新线索').trim()||'新线索';
}
function leadConversionText(lead){
  if(lead?.studentId&&lead?.courtId)return '已转课程+订场';
  if(lead?.studentId||lead?.isCourseConverted)return '已转课程';
  if(lead?.courtId||lead?.isCourtConverted)return '已转订场';
  if(lead?.isMembershipConverted)return '已升级会员';
  return '未转化';
}
function leadConvertedYesNo(lead){
  return lead?.convertedFlag===true||lead?.studentId||lead?.courtId||lead?.isCourseConverted||lead?.isCourtConverted||lead?.isMembershipConverted?'是':'否';
}
function leadCommunicationText(lead){
  const latest=leadFollowupRows(lead)[0]||null;
  return String(latest?.communicationNote||lead?.latestConclusion||'').trim()||'-';
}
function leadCommunicationLines(text){
  const raw=String(text||'').trim();
  if(!raw)return ['-'];
  const normalized=raw
    .replace(/；\s*/g,'\n')
    .replace(/；/g,'\n')
    .replace(/(?<!^)\s*(?=(?:\d{1,2}[月\/.-]\d{1,2}(?:日)?))/g,'\n');
  const lines=normalized.split('\n').map(item=>item.trim()).filter(Boolean);
  return lines.length?lines:['-'];
}
function renderLeadCommunicationBlock(text){
  return leadCommunicationLines(text).map(line=>`<div>${esc(line)}</div>`).join('');
}
function leadProfileText(lead){
  return String(lead?.profileNote||'').trim()||'-';
}
function leadLevelText(lead){
  return String(lead?.level||'').trim()||'-';
}
function leadFallbackYear(lead={}){
  const match=String(lead?.leadDate||lead?.createdAt||'').match(/^(\d{4})/);
  return match?match[1]:String(new Date().getFullYear());
}
function leadDateParts(value,lead={}){
  const raw=String(value||'').trim();
  if(!raw)return null;
  let m=raw.match(/(\d{4})[年\/.-](\d{1,2})[月\/.-](\d{1,2})/);
  if(m)return {year:m[1],month:m[2],day:m[3],end:m.index+m[0].length};
  m=raw.match(/(^|[^\d])(\d{1,2})[月.\/-](\d{1,2})(?:日)?/);
  if(m)return {year:leadFallbackYear(lead),month:m[2],day:m[3],end:m.index+m[0].length};
  return null;
}
function leadDateOnly(value,lead={}){
  const parts=leadDateParts(value,lead);
  if(!parts)return '';
  return `${parts.year}-${String(parts.month).padStart(2,'0')}-${String(parts.day).padStart(2,'0')}`;
}
function leadTimeRangeText(value,lead={}){
  const raw=String(value||'').trim();
  const parts=leadDateParts(raw,lead);
  const rest=parts?raw.slice(parts.end):raw;
  const m=rest.match(/(\d{1,2})(?:[:点](\d{1,2}))?\s*(?:-|~|–|—|至|到)\s*(\d{1,2})(?:[:点](\d{1,2}))?/);
  if(!m)return '';
  const start=`${String(m[1]).padStart(2,'0')}:${String(m[2]||'00').padStart(2,'0')}`;
  const end=`${String(m[3]).padStart(2,'0')}:${String(m[4]||'00').padStart(2,'0')}`;
  return `${start}-${end}`;
}
function leadDaysAgoOnly(date){
  const text=daysAgoText(date);
  const match=String(text||'').match(/(\d+天前)$/);
  return match?match[1]:'';
}
function leadRecentDateText(value){
  const date=leadDateOnly(value);
  return date?daysAgoText(date):'-';
}
function leadTrialDateText(lead){
  const raw=lead?.trialAtRaw||lead?.trialLessonAt||lead?.trialAt;
  const date=leadDateOnly(raw,lead);
  if(!date)return '-';
  const time=leadTimeRangeText(raw,lead);
  const ago=leadDaysAgoOnly(date);
  return [date,time,ago].filter(Boolean).join(' ');
}
function leadCourseConverted(lead){
  const status=String(lead?.rawStatus||lead?.systemStatus||'');
  return !!(lead?.studentId||lead?.isCourseConverted||/已报名|已转课程/.test(status));
}
function leadPurchaseSignupDate(lead){
  if(!leadCourseConverted(lead))return '';
  const studentId=String(lead?.studentId||'').trim();
  if(!studentId)return '';
  const rows=(Array.isArray(purchases)?purchases:[])
    .filter(item=>String(item?.studentId||'')===studentId)
    .filter(item=>!['voided','refunded','deleted'].includes(String(item?.status||'').trim()))
    .map(item=>leadDateOnly(item?.purchaseDate||item?.createdAt,lead))
    .filter(Boolean)
    .sort();
  return rows[0]||'';
}
function leadFormalSignupDateText(lead){
  return leadPurchaseSignupDate(lead)||leadDateOnly(lead?.enrollAtRaw||lead?.formalSignupAt||lead?.enrollAt,lead)||'-';
}
function leadFollowupCount(lead){
  return leadFollowupRows(lead).length;
}
function leadFollowupConvertedText(followup){
  const status=String(followup?.statusAfter||'').trim();
  return /已报名|已定场|定场|已转/.test(status)?'已转化':'未转化';
}
function leadNowInputValue(){
  const d=new Date();
  const pad=v=>String(v).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function leadInputToStorageValue(value){
  const text=String(value||'').trim();
  return text?text.replace('T',' '):'';
}
function leadStorageToInputValue(value){
  const text=String(value||'').trim();
  if(!text)return '';
  return text.replace(' ','T').slice(0,16);
}
function leadTagClass(kind,value=''){
  const text=String(value||'').trim();
  if(kind==='source')return text==='大众点评'?'tms-tag-tier-blue':text==='小红书'?'tms-tag-red':text==='线下到店'?'tms-tag-tier-gold':text==='转介绍'?'tms-tag-tier-teal':'tms-tag-tier-slate';
  if(kind==='consult')return /私教/.test(text)?'tms-tag-green':/随到随学|小班/.test(text)?'tms-tag-tier-blue':/训练营/.test(text)?'tms-tag-tier-gold':/订场|场地/.test(text)?'tms-tag-tier-teal':/专项/.test(text)?'tms-tag-red':'tms-tag-tier-slate';
  if(kind==='intent')return /^高/.test(text)?'tms-tag-green':/^中/.test(text)?'tms-tag-tier-blue':/^低/.test(text)?'tms-tag-tier-gold':/沉默/.test(text)?'tms-tag-tier-slate':'tms-tag-tier-slate';
  if(kind==='owner')return 'tms-tag-tier-teal';
  if(kind==='converted')return text==='是'?'tms-tag-green':'tms-tag-tier-slate';
  if(kind==='conversion'){
    if(text==='已转课程+订场')return 'tms-tag-tier-gold';
    if(text==='已转课程')return 'tms-tag-green';
    if(text==='已转订场'||text==='已升级会员')return 'tms-tag-tier-blue';
    return 'tms-tag-tier-slate';
  }
  if(kind==='status'){
    if(text==='体验课完成')return 'tms-tag-lead-trial-done';
    if(text==='体验课预约')return 'tms-tag-lead-trial-booked';
    if(text==='无意向')return 'tms-tag-lead-no-intent';
    if(text==='新线索')return 'tms-tag-lead-new';
    if(text==='已报名-私教')return 'tms-tag-lead-private';
    if(text==='已报名-随到随学')return 'tms-tag-lead-dropin';
    if(text==='已报名-训练营')return 'tms-tag-lead-camp';
    if(text==='已报名-专项')return 'tms-tag-lead-special';
    if(text==='已订场')return 'tms-tag-lead-court';
    if(text==='已对接其他校区')return 'tms-tag-lead-campus';
    if(text==='已沟通')return 'tms-tag-lead-communicated';
    if(text==='已流失')return 'tms-tag-lead-lost';
    if(text==='转化跟进中')return 'tms-tag-lead-converting';
    if(text==='已转课程'||text==='已转订场'||text==='已转课程+订场')return 'tms-tag-green';
    if(text==='已约体验')return 'tms-tag-tier-teal';
    if(text==='已约体验课')return 'tms-tag-lead-trial-booked';
    return 'tms-tag-tier-gold';
  }
  return 'tms-tag-tier-slate';
}
function renderLeadTag(value,kind){
  const text=String(value||'').trim()||'-';
  return `<span class="tms-tag ${leadTagClass(kind,text)}">${esc(text)}</span>`;
}
function leadNeedsFollowup(lead){
  const next=String(lead?.nextFollowupAt||'').slice(0,10);
  if(!next)return false;
  return next<=today()&&leadSystemStatusText(lead)!=='已流失';
}
function leadPhoneValid(value){
  const phone=String(value||'').replace(/\s+/g,'').trim();
  return !phone||/^1[3-9]\d{9}$/.test(phone);
}
function leadSourceOptions(){
  return Array.from(new Set(leadRows().map(item=>String(item?.source||'').trim()).filter(Boolean))).map(value=>({value,label:value}));
}
function leadConsultOptions(){
  return Array.from(new Set(leadRows().map(item=>String(item?.consultType||'').trim()).filter(Boolean))).map(value=>({value,label:value}));
}
function leadOwnerOptions(){
  return Array.from(new Set([...leadRows().map(item=>String(item?.owner||'').trim()).filter(Boolean),...activeCoachNames()])).map(value=>({value,label:value}));
}
function leadCampusText(lead){
  return campusDisplayName(lead?.campus||'')||'-';
}
function leadCampusOptions(){
  return [{value:'',label:'-'},...campuses.map(c=>({value:c.code||c.id,label:campusDisplayName(c.name||c.code||c.id)}))];
}
function leadStatusOptionValues(rows){
  const preferred=['体验课完成','体验课预约','无意向','新线索','已报名-私教','已报名-随到随学','已报名-训练营','已报名-专项','已订场','已对接其他校区','已沟通','已流失','转化跟进中'];
  const current=Array.from(new Set((Array.isArray(rows)?rows:[]).map(item=>leadFollowupStatusText(item)).map(item=>String(item||'').trim()).filter(Boolean)));
  const seen=new Set();
  const values=[];
  preferred.forEach(value=>{
    if(current.includes(value)&&!seen.has(value)){values.push(value);seen.add(value);}
  });
  current.forEach(value=>{
    if(!seen.has(value)){values.push(value);seen.add(value);}
  });
  return values;
}
function leadDateKeyFromDate(date){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function leadDateFromKey(value){
  const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return null;
  return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
}
function leadDateAdd(value,days){
  const date=leadDateFromKey(value);
  if(!date)return '';
  date.setDate(date.getDate()+days);
  return leadDateKeyFromDate(date);
}
function leadMonthEnd(value){
  const date=leadDateFromKey(value);
  if(!date)return '';
  return leadDateKeyFromDate(new Date(date.getFullYear(),date.getMonth()+1,0));
}
function leadDateRangeForPreset(preset){
  const current=today();
  if(preset==='today')return {start:current,end:current};
  if(preset==='week'){
    const date=leadDateFromKey(current);
    const day=date?date.getDay():1;
    const offset=day===0?-6:1-day;
    const start=leadDateAdd(current,offset);
    return {start,end:leadDateAdd(start,6)};
  }
  if(preset==='month')return {start:`${current.slice(0,7)}-01`,end:leadMonthEnd(current)};
  if(preset==='custom')return {start:leadDateCustomStart,end:leadDateCustomEnd};
  return {start:'',end:''};
}
function leadDefaultCustomDateRange(){
  const current=today();
  const date=leadDateFromKey(current);
  const day=date?date.getDay():4;
  const offset=day>=4?4-day:-(day+3);
  const start=leadDateAdd(current,offset);
  return {start,end:leadDateAdd(start,7)};
}
function getLeadDateFilterRange(){
  return leadDateRangeForPreset(leadDatePreset);
}
function leadInDateRange(lead,range){
  const start=String(range?.start||'');
  const end=String(range?.end||'');
  if(!start&&!end)return true;
  const date=leadDateOnly(lead?.leadDate,lead);
  if(!date)return false;
  if(start&&date<start)return false;
  if(end&&date>end)return false;
  return true;
}
function leadGlobalDateValue(lead){
  return leadDateOnly(lead?.leadDate,lead)||lead?.createdAt||lead?.updatedAt||lead?.lastFollowupAt;
}
function renderLeadDateScopeControls(){
  document.querySelectorAll('#leadDateScopeBar [data-lead-date-preset]').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.leadDatePreset===leadDatePreset);
  });
  const custom=document.getElementById('leadDateCustomRange');
  if(custom)custom.classList.toggle('active',leadDatePreset==='custom');
  const from=document.getElementById('leadDateFrom');
  const to=document.getElementById('leadDateTo');
  if(from&&from.value!==leadDateCustomStart)from.value=leadDateCustomStart;
  if(to&&to.value!==leadDateCustomEnd)to.value=leadDateCustomEnd;
  syncDateButton('leadDateFrom','leadDateFrom_btn','开始日期');
  syncDateButton('leadDateTo','leadDateTo_btn','结束日期');
}
function setLeadDatePreset(preset){
  leadDatePreset=['all','today','week','month','custom'].includes(preset)?preset:'all';
  if(leadDatePreset==='custom'&&!leadDateCustomStart&&!leadDateCustomEnd){
    const range=leadDefaultCustomDateRange();
    leadDateCustomStart=range.start;
    leadDateCustomEnd=range.end;
  }
  if(leadDatePreset!=='custom'){
    leadDateCustomStart='';
    leadDateCustomEnd='';
  }
  leadPage=1;
  renderLeads();
}
function setLeadCustomDateRange(){
  leadDatePreset='custom';
  leadDateCustomStart=document.getElementById('leadDateFrom')?.value||'';
  leadDateCustomEnd=document.getElementById('leadDateTo')?.value||'';
  leadPage=1;
  renderLeads();
}
function leadSortDateValue(value,lead={}){
  const raw=String(value||'').trim().replace(' 00:00:00','').replace('00:00:00','').replace('//','/');
  if(!raw)return 0;
  const date=leadDateOnly(raw,lead);
  if(date){
    const m=date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(m)return new Date(Number(m[1]), Number(m[2])-1, Number(m[3])).getTime();
  }
  const parsed=Date.parse(raw);
  return Number.isFinite(parsed)?parsed:0;
}
function leadSortValue(lead,key){
  if(key==='leadDate')return leadSortDateValue(lead?.leadDate,lead);
  if(key==='trialLessonAt')return leadSortDateValue(lead?.trialAtRaw||lead?.trialLessonAt||lead?.trialAt,lead);
  if(key==='lastFollowupAt')return leadSortDateValue(lead?.lastFollowupAt,lead);
  if(key==='formalSignupAt')return leadSortDateValue(leadPurchaseSignupDate(lead)||lead?.enrollAtRaw||lead?.formalSignupAt||lead?.enrollAt,lead);
  if(key==='followupCount')return leadFollowupCount(lead);
  return '';
}
function getSortedLeads(list){
  if(!leadSortKey||!leadSortDir)return list;
  const dir=leadSortDir==='asc'?1:-1;
  return list.map((item,index)=>({item,index})).sort((a,b)=>{
    const av=leadSortValue(a.item,leadSortKey),bv=leadSortValue(b.item,leadSortKey);
    const zeroIsEmpty=leadSortKey!=='followupCount';
    const emptyA=av===''||av===null||av===undefined||(zeroIsEmpty&&av===0);
    const emptyB=bv===''||bv===null||bv===undefined||(zeroIsEmpty&&bv===0);
    if(emptyA&&emptyB)return a.index-b.index;
    if(emptyA)return 1;
    if(emptyB)return -1;
    if(typeof av==='number'||typeof bv==='number')return ((Number(av)||0)-(Number(bv)||0))*dir||a.index-b.index;
    return String(av).localeCompare(String(bv))*dir||a.index-b.index;
  }).map(row=>row.item);
}
function cycleLeadSort(key){
  if(leadSortKey!==key){leadSortKey=key;leadSortDir='asc';}
  else if(leadSortDir==='asc')leadSortDir='desc';
  else {leadSortKey='';leadSortDir='';}
  leadPage=1;
  renderLeads();
}
function updateLeadSortHeaders(){
  document.querySelectorAll('#page-leads [data-lead-sort]').forEach(btn=>{
    const active=btn.dataset.leadSort===leadSortKey;
    btn.classList.toggle('asc',active&&leadSortDir==='asc');
    btn.classList.toggle('desc',active&&leadSortDir==='desc');
  });
}
function leadPageNumbers(page,pages){
  if(pages<=7)return Array.from({length:pages},(_,i)=>i+1);
  const items=[1];
  const start=Math.max(2,page-2);
  const end=Math.min(pages-1,page+2);
  if(start>2)items.push('...');
  for(let i=start;i<=end;i++)items.push(i);
  if(end<pages-1)items.push('...');
  items.push(pages);
  return items;
}
function leadStudentMatchText(row){
  if(row?.studentMatchType==='auto')return `已自动关联：${row.studentMatchName||row.studentId||'-'}`;
  if(row?.studentMatchType==='possible')return `疑似学员：${row.studentMatchName||'-'}`;
  return '未匹配';
}
function leadCourtMatchText(row){
  if(row?.courtMatchType==='auto')return `已自动关联：${row.courtMatchName||row.courtId||'-'}`;
  if(row?.courtMatchType==='possible')return `疑似订场：${row.courtMatchName||'-'}`;
  return '未匹配';
}
function getFilteredLeads(){
  const q=(document.getElementById('leadSearch')?.value||'').trim().toLowerCase();
  const sourceValue=document.getElementById('leadSourceFilter')?.value||'';
  const consultValue=document.getElementById('leadConsultFilter')?.value||'';
  const statusValue=document.getElementById('leadStatusFilter')?.value||'';
  const convertedValue=document.getElementById('leadConvertedFilter')?.value||'';
  const ownerValue=document.getElementById('leadOwnerFilter')?.value||'';
  const campusValue=campus;
  return leadRows().filter(lead=>{
    if(!leadInDateRange(lead,getLeadDateFilterRange()))return false;
    if(!globalDateWithinRange(leadGlobalDateValue(lead)))return false;
    if(!searchHit(q,leadDisplayName(lead),lead?.phone,lead?.wechatName,lead?.source,lead?.consultType,lead?.owner,lead?.profileNote))return false;
    if(sourceValue&&String(lead?.source||'')!==sourceValue)return false;
    if(consultValue&&String(lead?.consultType||'')!==consultValue)return false;
    if(statusValue&&leadFollowupStatusText(lead)!==statusValue)return false;
    if(convertedValue&&leadConvertedYesNo(lead)!==convertedValue)return false;
    if(ownerValue&&String(lead?.owner||'')!==ownerValue)return false;
    if(campusValue!=='all'&&!sameCampusValue(lead?.campus,campusValue))return false;
    return true;
  }).sort((a,b)=>{
    const leadDateDiff = leadSortDateValue(b?.leadDate) - leadSortDateValue(a?.leadDate);
    if(leadDateDiff!==0)return leadDateDiff;
    const followupDiff = leadSortDateValue(b?.lastFollowupAt) - leadSortDateValue(a?.lastFollowupAt);
    if(followupDiff!==0)return followupDiff;
    return String(b?.updatedAt||'').localeCompare(String(a?.updatedAt||''));
  });
}
function renderLeadToolbarFilters(){
  const rows=leadRows().filter(lead=>leadInDateRange(lead,getLeadDateFilterRange())&&globalDateWithinRange(leadGlobalDateValue(lead))&&(campus==='all'||sameCampusValue(lead?.campus,campus)));
  const sourceValue=document.getElementById('leadSourceFilter')?.value||'';
  const consultValue=document.getElementById('leadConsultFilter')?.value||'';
  const statusValue=document.getElementById('leadStatusFilter')?.value||'';
  const convertedValue=document.getElementById('leadConvertedFilter')?.value||'';
  const ownerValue=document.getElementById('leadOwnerFilter')?.value||'';
  const statusValues=leadStatusOptionValues(rows);
  const linked=withLinkedFilterCounts([
    {key:'source',value:sourceValue,options:[{value:'',label:'全部',emptyDisplay:'来源'},...Array.from(new Set(rows.map(item=>String(item?.source||'').trim()).filter(Boolean))).map(value=>({value,label:value}))],match:(lead,value)=>String(lead?.source||'')===String(value)},
    {key:'consult',value:consultValue,options:[{value:'',label:'全部',emptyDisplay:'咨询需求'},...Array.from(new Set(rows.map(item=>String(item?.consultType||'').trim()).filter(Boolean))).map(value=>({value,label:value}))],match:(lead,value)=>String(lead?.consultType||'')===String(value)},
    {key:'status',value:statusValue,options:[{value:'',label:'全部',emptyDisplay:'状态'},...statusValues.map(value=>({value,label:value}))],match:(lead,value)=>leadFollowupStatusText(lead)===String(value)},
    {key:'converted',value:convertedValue,options:[{value:'',label:'全部',emptyDisplay:'是否转化'},{value:'是',label:'是'},{value:'否',label:'否'}],match:(lead,value)=>leadConvertedYesNo(lead)===String(value)},
    {key:'owner',value:ownerValue,options:[{value:'',label:'全部',emptyDisplay:'跟进人'},...Array.from(new Set(rows.map(item=>String(item?.owner||'').trim()).filter(Boolean))).map(value=>({value,label:value}))],match:(lead,value)=>String(lead?.owner||'')===String(value)}
  ],rows);
  const configs=[
    ['leadSourceFilterHost','leadSourceFilter','全部来源',linked.source.options,linked.source.value],
    ['leadConsultFilterHost','leadConsultFilter','全部咨询需求',linked.consult.options,linked.consult.value],
    ['leadStatusFilterHost','leadStatusFilter','全部状态',linked.status.options,linked.status.value],
    ['leadConvertedFilterHost','leadConvertedFilter','全部是否转化',linked.converted.options,linked.converted.value],
    ['leadOwnerFilterHost','leadOwnerFilter','全部跟进人',linked.owner.options,linked.owner.value]
  ];
  configs.forEach(([hostId,id,label,options,value])=>{
    const host=document.getElementById(hostId);
    if(host)host.innerHTML=renderCourtDropdownHtml(id,label,options,value,false,'onLeadFilterChange');
  });
}
function leadConverted(lead){
  return leadConvertedYesNo(lead)==='是';
}
function leadTrialDoneByStatus(lead){
  return [lead?.rawStatus,lead?.systemStatus].some(value=>String(value||'').trim()==='体验课完成');
}
function leadTrialDoneByTime(lead){
  const raw=lead?.trialAtRaw||lead?.trialLessonAt||lead?.trialAt;
  const date=leadDateOnly(raw,lead);
  return !!date&&date<=today();
}
function leadTrialDone(lead){
  return leadTrialDoneByStatus(lead)||leadTrialDoneByTime(lead);
}
function leadRateText(value,total){
  if(!total)return '0%';
  const percent=(value/total)*100;
  return `${Number.isInteger(percent)?percent:percent.toFixed(1)}%`;
}
function leadStatsData(list){
  const base=Array.isArray(list)?list:[];
  const trialDoneRows=base.filter(leadTrialDone);
  const convertedRows=base.filter(leadConverted);
  const trialConvertedRows=trialDoneRows.filter(leadConverted);
  const trialPendingConversion=trialDoneRows.length-trialConvertedRows.length;
  return {
    total:base.length,
    trialDone:trialDoneRows.length,
    trialCompletionRate:leadRateText(trialDoneRows.length,base.length),
    trialConverted:trialConvertedRows.length,
    trialConversionRate:leadRateText(trialConvertedRows.length,trialDoneRows.length),
    converted:convertedRows.length,
    leadConversionRate:leadRateText(convertedRows.length,base.length),
    trialPendingConversion,
    trialPendingConversionRate:leadRateText(trialPendingConversion,trialDoneRows.length)
  };
}
function renderLeadStats(list){
  const stats=leadStatsData(list);
  const cardData=[
    {label:'线索数',valueHtml:`${stats.total}<span>条</span>`},
    {label:'全盘最终转化',valueHtml:stats.converted,percent:stats.leadConversionRate,sub:'已转化线索 / 线索数'},
    {label:'邀约体验课转化',valueHtml:stats.trialDone,percent:stats.trialCompletionRate,sub:'已上体验课 / 线索数'},
    {label:'体验课成单转化',valueHtml:stats.trialConverted,percent:stats.trialConversionRate,sub:'已体验且转化 / 已上体验课'},
    {label:'高意向蓄水池',valueHtml:`${stats.trialPendingConversion}<span>人 / ${stats.trialPendingConversionRate}</span>`,sub:'已体验待转化 / 已上体验课'}
  ];
  const host=document.getElementById('leadStatsRow');
  if(host)host.innerHTML=renderStandardDataCards(cardData);
}
function leadTimelineHtml(lead){
  const rows=leadFollowupRows(lead);
  if(!rows.length)return '<div class="empty"><p>暂无跟进时间线</p></div>';
  return `<div class="lead-timeline-list">${rows.map(item=>`<div class="lead-timeline-item"><div class="lead-timeline-line">${esc(leadTimelineLineText(item))}</div><button class="lead-timeline-edit" onclick="openLeadFollowupModal('${lead.id}','${item.id}')" aria-label="编辑跟进"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M9.96 1.54a1.4 1.4 0 0 1 1.98 1.98L4.74 10.72 2.1 11.4l.68-2.64 7.18-7.22Zm-.72 1.42L3.7 8.5l-.28 1.08 1.08-.28 5.54-5.54-.8-.8Z" fill="currentColor"/></svg></button></div>`).join('')}</div>`;
}
function leadTimelineLineText(item){
  const date=leadFollowupDateText(item);
  const by=leadFollowupPersonText(item);
  const status=leadFollowupConvertedText(item);
  const note=leadFollowupNoteText(item);
  return `${date} · ${by} 跟进 · （${status}）\n${note}`;
}
function linkedStudentName(lead){
  const stu=students.find(item=>String(item?.id||'')===String(lead?.studentId||''));
  return stu?.name||lead?.studentId||'-';
}
function linkedCourtName(lead){
  const court=courts.find(item=>String(item?.id||'')===String(lead?.courtId||''));
  return court?.name||lead?.courtId||'-';
}
function leadDetailFieldHtml(label,value){
  return `<div class="tms-detail-field tms-data-field"><div class="tms-detail-label tms-data-label">${esc(label)}</div><div class="tms-detail-value tms-data-value">${esc(renderCourtEmptyText(value))}</div></div>`;
}
function leadDetailIsEmptyHtml(html){
  const text=String(html||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').trim();
  return !text||['-','暂无跟进时间线','暂无线索详情'].includes(text);
}
function leadDetailBlockHtml(label,html,options={}){
  if(options.hideEmpty&&leadDetailIsEmptyHtml(html))return '';
  return `<div class="tms-detail-field tms-data-field full-width"><div class="tms-detail-label tms-data-label">${esc(label)}</div><div class="tms-detail-block tms-data-block">${html||'-'}</div></div>`;
}
function leadReadonlyCardHtml(content,extraClass=''){
  if(!content)return '';
  const cls=['tms-readonly-card',extraClass].filter(Boolean).join(' ');
  return `<div class="${cls}"><div class="tms-detail-grid">${content}</div></div>`;
}
function leadDetailSectionHtml(title,content,first=false){
  return content?`<div class="tms-section-header"${first?' style="margin-top:0;"':''}>${title}</div><div class="tms-detail-grid">${content}</div>`:'';
}
function openLeadDetail(leadId){
  const lead=leadById(leadId);
  if(!lead)return;
  const body=`
    ${leadDetailSectionHtml('基础信息',leadReadonlyCardHtml(`
      ${leadDetailFieldHtml('微信名',leadWechatText(lead))}
      ${leadDetailFieldHtml('电话',lead?.phone||'-')}
      ${leadDetailFieldHtml('线索时间',lead?.leadDate||'-')}
      ${leadDetailFieldHtml('线索来源',lead?.source||'-')}
      ${leadDetailFieldHtml('所属校区',leadCampusText(lead))}
      ${leadDetailFieldHtml('咨询需求',lead?.consultType||'-')}
      ${leadDetailFieldHtml('意向类型',lead?.intentLevel||'-')}
      ${leadDetailFieldHtml('跟进人',lead?.owner||'-')}
      ${leadDetailBlockHtml('基本信息',esc(leadProfileText(lead)),{hideEmpty:true})}
    `,'lead-readonly-card lead-readonly-card-4'),true)}
    ${leadDetailSectionHtml('跟进时间线',`<div class="tms-detail-field tms-data-field full-width"><div class="tms-detail-block tms-data-block">${leadTimelineHtml(lead)}</div></div>`)}
  `;
  const actions=`<button class="tms-btn tms-btn-default" onclick="convertLeadToStudent('${lead.id}')">转学员</button><button class="tms-btn tms-btn-default" onclick="convertLeadToCourt('${lead.id}')">转订场</button><button class="tms-btn tms-btn-primary" onclick="openLeadModal('${lead.id}')">编辑</button>`;
  setCourtModalFrame('线索详情',body,actions,'modal-view modal-lead-detail');
}
function openLeadModal(leadId){
  const lead=leadById(leadId)||null;
  const intentOptions=[{value:'',label:'-'},{value:'高',label:'高'},{value:'中',label:'中'},{value:'低',label:'低'}];
  const campusValue=lead?.campus||(campus!=='all'?campus:'mabao');
  const body=`<div class="tms-form-row lead-form-row-4"><div class="tms-form-item"><label class="tms-form-label">微信名</label><input class="finput tms-form-control" id="lead_wechatName" value="${esc(lead?.wechatName||lead?.displayName||'')}"></div><div class="tms-form-item"><label class="tms-form-label">电话</label><input class="finput tms-form-control" id="lead_phone" value="${esc(lead?.phone||'')}"></div><div class="tms-form-item"><label class="tms-form-label">线索时间</label>${courtDateButtonHtml('lead_leadDate',lead?.leadDate||today(),'线索时间')}</div><div class="tms-form-item"><label class="tms-form-label">线索来源</label>${renderCourtDropdownHtml('lead_source','线索来源',[{value:'',label:'-'},...leadSourceOptions()],lead?.source||'',true)}</div></div><div class="tms-form-row lead-form-row-4"><div class="tms-form-item"><label class="tms-form-label">所属校区</label>${renderCourtDropdownHtml('lead_campus','所属校区',leadCampusOptions(),campusValue,true)}</div><div class="tms-form-item"><label class="tms-form-label">咨询需求</label>${renderCourtDropdownHtml('lead_consultType','咨询需求',[{value:'',label:'-'},...leadConsultOptions()],lead?.consultType||'',true)}</div><div class="tms-form-item"><label class="tms-form-label">意向类型</label>${renderCourtDropdownHtml('lead_intentLevel','意向类型',intentOptions,lead?.intentLevel||'',true)}</div><div class="tms-form-item"><label class="tms-form-label">跟进人</label>${renderCourtDropdownHtml('lead_owner','跟进人',[{value:'',label:'-'},...leadOwnerOptions()],lead?.owner||currentUser?.name||'',true)}</div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">基本信息</label><textarea class="finput tms-form-control" id="lead_profileNote">${esc(lead?.profileNote||'')}</textarea></div></div>`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" id="leadSaveBtn" onclick="saveLead('${leadId||''}')">保存</button>`;
  setCourtModalFrame(leadId?'编辑线索':'新增线索',body,actions,'modal-complex modal-leads-form');
}
async function refreshLeadRuntime({withStudents=false,withCourts=false}={}){
  const base=['leads','leadFollowups'];
  if(withStudents)base.push('students');
  await ensureDatasetsByName(base,{force:true});
  if(withCourts){
    try{
      await ensureDatasetsByName(['courts'],{force:true});
    }catch(e){
      console.warn('lead runtime refresh skipped courts',e);
    }
  }
}
async function saveLead(leadId=''){
  const wechatName=document.getElementById('lead_wechatName')?.value?.trim?.()||'';
  const phone=document.getElementById('lead_phone')?.value?.trim?.()||'';
  if(!wechatName){toast('请填写微信名','warn');return;}
  if(!leadPhoneValid(phone)){toast('手机号格式不正确','warn');return;}
  const btn=document.getElementById('leadSaveBtn');
  if(btn){btn.disabled=true;btn.textContent='保存中…';}
  const payload={
    displayName:wechatName,
    phone,
    wechatName,
    leadDate:document.getElementById('lead_leadDate')?.value||today(),
    source:document.getElementById('lead_source')?.value||'',
    campus:document.getElementById('lead_campus')?.value||'',
    consultType:document.getElementById('lead_consultType')?.value||'',
    intentLevel:document.getElementById('lead_intentLevel')?.value||'',
    owner:document.getElementById('lead_owner')?.value||'',
    profileNote:document.getElementById('lead_profileNote')?.value?.trim?.()||''
  };
  try{
    if(leadId)await apiCall('PUT','/leads/'+leadId,payload);
    else await apiCall('POST','/leads',{...payload,createInitialFollowup:true});
    closeModal();
    await refreshLeadRuntime();
    renderLeads();
    toast(leadId?'线索已更新 ✓':'线索已创建 ✓','success');
  }catch(e){
    toast('保存失败：'+e.message,'error');
    if(btn){btn.disabled=false;btn.textContent='保存';}
  }
}
function openLeadFollowupModal(leadId,followupId=''){
  const lead=leadById(leadId)||null;
  const followup=(Array.isArray(leadFollowups)?leadFollowups:[]).find(item=>String(item?.id||'')===String(followupId))||null;
  const followupTypeOptions=[{value:'电话',label:'电话'},{value:'微信',label:'微信'},{value:'到店',label:'到店'},{value:'面谈',label:'面谈'},{value:'其他',label:'其他'}];
  const statusOptions=[{value:'新线索',label:'新线索'},{value:'跟进中',label:'跟进中'},{value:'已约体验',label:'已约体验'},{value:'已转课程',label:'已转课程'},{value:'已转订场',label:'已转订场'},{value:'已转课程+订场',label:'已转课程+订场'},{value:'已流失',label:'已流失'}];
  const body=`<div class="tms-section-header" style="margin-top:0;">${followup?'编辑跟进':'新增跟进'}</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">跟进时间</label><input type="datetime-local" class="finput tms-form-control" id="lead_followupAt" value="${esc(followup?leadStorageToInputValue(followup.followupAt):leadNowInputValue())}"></div><div class="tms-form-item"><label class="tms-form-label">跟进人</label><input class="finput tms-form-control" id="lead_followupBy" value="${esc(followup?.followupBy||currentUser?.name||lead?.owner||'')}"></div><div class="tms-form-item"><label class="tms-form-label">跟进方式</label>${renderCourtDropdownHtml('lead_followupType','跟进方式',followupTypeOptions,followup?.followupType||'电话',true)}</div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">沟通内容</label><textarea class="finput tms-form-control" id="lead_communicationNote">${esc(followup?.communicationNote||'')}</textarea></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">用户顾虑</label><textarea class="finput tms-form-control" id="lead_concern">${esc(followup?.concern||'')}</textarea></div><div class="tms-form-item"><label class="tms-form-label">本次结论</label><textarea class="finput tms-form-control" id="lead_conclusion">${esc(followup?.conclusion||'')}</textarea></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">当前状态</label>${renderCourtDropdownHtml('lead_statusAfter','当前状态',statusOptions,followup?.statusAfter||leadSystemStatusText(lead),true)}</div><div class="tms-form-item"><label class="tms-form-label">下次跟进时间</label>${courtDateButtonHtml('lead_nextFollowupAt',followup?.nextFollowupAt||lead?.nextFollowupAt||'','下次跟进时间')}</div><div class="tms-form-item"><label class="tms-form-label">下次动作</label><input class="finput tms-form-control" id="lead_nextAction" value="${esc(followup?.nextAction||lead?.nextAction||'')}"></div></div>`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" id="leadFollowupSaveBtn" onclick="saveLeadFollowup('${leadId}','${followupId||''}')">保存跟进</button>`;
  setCourtModalFrame(followup?'编辑跟进':'新增跟进',body,actions,'modal-wide');
}
async function saveLeadFollowup(leadId,followupId=''){
  const btn=document.getElementById('leadFollowupSaveBtn');
  if(btn){btn.disabled=true;btn.textContent='保存中…';}
  const payload={
    followupAt:leadInputToStorageValue(document.getElementById('lead_followupAt')?.value)||new Date().toISOString(),
    followupBy:document.getElementById('lead_followupBy')?.value?.trim?.()||currentUser?.name||'',
    followupType:document.getElementById('lead_followupType')?.value||'其他',
    communicationNote:document.getElementById('lead_communicationNote')?.value?.trim?.()||'',
    concern:document.getElementById('lead_concern')?.value?.trim?.()||'',
    conclusion:document.getElementById('lead_conclusion')?.value?.trim?.()||'',
    statusAfter:document.getElementById('lead_statusAfter')?.value||'跟进中',
    nextFollowupAt:document.getElementById('lead_nextFollowupAt')?.value||'',
    nextAction:document.getElementById('lead_nextAction')?.value?.trim?.()||''
  };
  try{
    if(followupId)await apiCall('PUT',`/lead-followups/${followupId}`,payload);
    else await apiCall('POST',`/leads/${leadId}/followups`,payload);
    closeModal();
    await refreshLeadRuntime();
    renderLeads();
    openLeadDetail(leadId);
    toast('跟进已保存 ✓','success');
  }catch(e){
    toast('保存失败：'+e.message,'error');
    if(btn){btn.disabled=false;btn.textContent='保存跟进';}
  }
}
function renderLeadImportPreviewBody(){
  const summary=leadImportState.summary||null;
  const rows=Array.isArray(leadImportState.previewRows)?leadImportState.previewRows:[];
  const fieldsHost=document.getElementById('leadImportFields');
  const missingHost=document.getElementById('leadImportMissing');
  const totalHost=document.getElementById('leadImportTotal');
  const statusHost=document.getElementById('leadImportStatus');
  const matchHost=document.getElementById('leadImportMatch');
  const possibleHost=document.getElementById('leadImportPossible');
  const unmatchedHost=document.getElementById('leadImportUnmatched');
  const tableHost=document.getElementById('leadImportPreviewRows');
  const commitBtn=document.getElementById('leadImportCommitBtn');
  if(fieldsHost)fieldsHost.innerHTML='线索时间 / 微信名/电话 / 水平 / 其他信息（包含年纪等） / 线索渠道 / 咨询需求 / 意向类型 / 跟进人 / 跟进状态 / 体验课时间 / 正式课报名时间 / 用户顾虑点 / 沟通情况和方案建议 / 是否转化 / 正式课教练 / 未成交原因';
  if(missingHost)missingHost.innerHTML=leadImportState.error?esc(leadImportState.error):'CSV 字段校验通过';
  if(totalHost)totalHost.textContent=summary?String(summary.totalRows||0):'0';
  if(statusHost)statusHost.innerHTML=summary?Object.entries(summary.byStatus||{}).map(([key,value])=>`${esc(key)}：${value}`).join('<br>'):'新线索 / 跟进中 / 已约体验 / 已转课程 / 已转订场 / 已流失';
  if(matchHost)matchHost.innerHTML=summary?`已自动关联学员：${summary.autoLinkedStudents||0}<br>已自动关联订场：${summary.autoLinkedCourts||0}<br>疑似匹配：${summary.possibleMatches||0}<br>未匹配：${summary.unmatchedRows||0}`:'已自动关联 / 疑似匹配待确认 / 未匹配待处理';
  if(possibleHost)possibleHost.innerHTML=rows.filter(row=>row.studentMatchType==='possible'||row.courtMatchType==='possible').slice(0,20).map(row=>`${esc(leadDisplayName(row))} · ${esc(leadStudentMatchText(row))} · ${esc(leadCourtMatchText(row))}`).join('<br>')||'预览后显示疑似匹配明细。';
  if(unmatchedHost)unmatchedHost.innerHTML=rows.filter(row=>row.studentMatchType==='none'&&row.courtMatchType==='none').slice(0,20).map(row=>`${esc(leadDisplayName(row))} · ${esc(row.phone||'无手机号')} · ${esc(row.source||'无来源')}`).join('<br>')||'预览后显示未匹配明细。';
  if(tableHost)tableHost.innerHTML=rows.length?`<div class="tms-table-wrapper" style="max-height:260px"><table class="tms-table"><thead><tr><th style="padding-left:20px">线索</th><th>来源</th><th>咨询需求</th><th>状态</th><th>学员匹配</th><th>订场匹配</th><th class="tms-sticky-r" style="padding-right:20px">转化</th></tr></thead><tbody>${rows.slice(0,20).map(row=>`<tr><td style="padding-left:20px">${esc(leadDisplayName(row))}<div class="tms-text-secondary">${esc(row.phone||'-')}</div></td><td>${renderCourtCellText(row.source)}</td><td>${renderCourtCellText(row.consultType)}</td><td>${renderCourtCellText(row.systemStatus)}</td><td>${renderCourtCellText(leadStudentMatchText(row),false)}</td><td>${renderCourtCellText(leadCourtMatchText(row),false)}</td><td class="tms-sticky-r" style="padding-right:20px">${renderCourtCellText(leadConversionText(row),false)}</td></tr>`).join('')}</tbody></table></div>${rows.length>20?'<div class="tms-text-secondary" style="margin-top:8px">仅预览前 20 条，正式导入按全部预览结果执行。</div>':''}`:'<div class="tms-text-secondary">预览后这里显示数据明细。</div>';
  if(commitBtn)commitBtn.disabled=!summary||!summary.totalRows||!!leadImportState.error;
}
function openLeadImportPreviewModal(){
  leadImportState={fileName:'',fileSize:0,fileModified:0,csvText:'',previewRows:[],summary:null,error:''};
  const body=`<div class="tms-section-header" style="margin-top:0;">导入预览</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">CSV 文件</label><input class="finput tms-form-control" id="leadImportFile" type="file" accept=".csv,text/csv" onchange="handleLeadImportFile(this)"></div></div><div class="tms-section-header">识别到的字段</div><div class="finput tms-form-control" id="leadImportFields" style="height:auto;min-height:56px">线索时间 / 微信名 / 电话 / 水平 / 线索渠道 / 咨询需求 / 跟进状态</div><div class="tms-section-header">缺失字段提醒</div><div class="finput tms-form-control" id="leadImportMissing" style="height:auto;min-height:56px">正式联调后这里显示缺列和异常字段。</div><div class="tms-section-header">总行数</div><div class="finput tms-form-control" id="leadImportTotal">0</div><div class="tms-section-header">状态归类统计</div><div class="finput tms-form-control" id="leadImportStatus" style="height:auto;min-height:56px">新线索 / 跟进中 / 已约体验 / 已转课程 / 已转订场 / 已流失</div><div class="tms-section-header">自动匹配统计</div><div class="finput tms-form-control" id="leadImportMatch" style="height:auto;min-height:56px">已自动关联 / 疑似匹配待确认 / 未匹配待处理</div><div class="tms-section-header">疑似匹配列表</div><div class="finput tms-form-control" id="leadImportPossible" style="height:auto;min-height:56px">预览后显示疑似匹配明细。</div><div class="tms-section-header">未匹配列表</div><div class="finput tms-form-control" id="leadImportUnmatched" style="height:auto;min-height:56px">预览后显示未匹配明细。</div><div class="tms-section-header">导入预览明细</div><div id="leadImportPreviewRows" class="finput tms-form-control" style="height:auto;min-height:56px">预览后显示数据明细。</div>`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-default" id="leadImportPreviewBtn" onclick="rerunLeadImportPreview()">开始预览</button><button class="tms-btn tms-btn-primary" id="leadImportCommitBtn" onclick="runLeadImportCommit()" disabled>确认导入</button>`;
  setCourtModalFrame('线索导入预览',body,actions,'modal-wide');
  renderLeadImportPreviewBody();
}
async function handleLeadImportFile(input){
  const file=input.files&&input.files[0];
  if(!file)return;
  try{
    const buf=await file.arrayBuffer();
    const csvText=decodeCourtCsvText(buf);
    leadImportState={fileName:file.name,fileSize:file.size,fileModified:file.lastModified||0,csvText,previewRows:[],summary:null,error:''};
    await rerunLeadImportPreview();
  }catch(e){
    leadImportState={...leadImportState,error:e.message||'读取失败'};
    renderLeadImportPreviewBody();
    toast('读取失败：'+e.message,'error');
  }
}
async function rerunLeadImportPreview(){
  if(!leadImportState.csvText){toast('请先选择 CSV 文件','warn');return;}
  const btn=document.getElementById('leadImportPreviewBtn');
  if(btn){btn.disabled=true;btn.textContent='预览中…';}
  try{
    const res=await apiCall('POST','/leads/import-preview',{csvText:leadImportState.csvText});
    leadImportState={...leadImportState,previewRows:res.rows||[],summary:res.summary||null,error:''};
    renderLeadImportPreviewBody();
    toast('预览已生成 ✓','success');
  }catch(e){
    leadImportState={...leadImportState,previewRows:[],summary:null,error:e.message||'预览失败'};
    renderLeadImportPreviewBody();
    toast('预览失败：'+e.message,'error');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='开始预览';}
  }
}
async function runLeadImportCommit(){
  if(!leadImportState.summary?.totalRows){toast('请先完成导入预览','warn');return;}
  if(!await appConfirm(`确认导入 ${leadImportState.summary.totalRows||0} 条线索？`,{title:'确认导入线索',confirmText:'确认导入'}))return;
  const btn=document.getElementById('leadImportCommitBtn');
  if(btn){btn.disabled=true;btn.textContent='导入中…';}
  try{
    const batchKey=[leadImportState.fileName,leadImportState.fileSize,leadImportState.fileModified].join(':');
    const res=await apiCall('POST','/leads/import-commit',{batchKey,rows:leadImportState.previewRows});
    closeModal();
    await refreshLeadRuntime({withStudents:true,withCourts:true});
    renderLeads();
    toast(`导入完成：线索 ${res.leadCount||0} 条，跟进 ${res.followupCount||0} 条`,'success');
  }catch(e){
    toast('导入失败：'+e.message,'error');
    if(btn){btn.disabled=false;btn.textContent='确认导入';}
  }
}
async function convertLeadToStudent(leadId){
  const lead=leadById(leadId);
  if(!lead)return;
  if(lead.studentId){toast('该线索已关联学员','warn');return;}
  if(!await appConfirm(`确认把「${leadDisplayName(lead)}」转为学员？`,{title:'转为学员',confirmText:'确认转化'}))return;
  try{
    await apiCall('POST',`/leads/${leadId}/convert-student`,{});
    await refreshLeadRuntime({withStudents:true});
    renderLeads();
    openLeadDetail(leadId);
    toast('已转为学员 ✓','success');
  }catch(e){
    toast('转化失败：'+e.message,'error');
  }
}
async function convertLeadToCourt(leadId){
  const lead=leadById(leadId);
  if(!lead)return;
  if(lead.courtId){toast('该线索已关联订场用户','warn');return;}
  if(!await appConfirm(`确认把「${leadDisplayName(lead)}」转为订场用户？`,{title:'转为订场用户',confirmText:'确认转化'}))return;
  try{
    await apiCall('POST',`/leads/${leadId}/convert-court`,{});
    await refreshLeadRuntime({withCourts:true});
    renderLeads();
    openLeadDetail(leadId);
    toast('已转为订场用户 ✓','success');
  }catch(e){
    toast('转化失败：'+e.message,'error');
  }
}
function openLeadLinkStudentModal(leadId){
  const lead=leadById(leadId);
  if(!lead)return;
  const options=[{value:'',label:'- 选择学员 -'},...students.slice().sort((a,b)=>String(a?.name||'').localeCompare(String(b?.name||''))).map(item=>({value:item.id,label:`${item.name}${item.phone?` · ${item.phone}`:''}`}))];
  const body=`<div class="tms-section-header" style="margin-top:0;">关联已有学员</div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">线索</label><input class="finput tms-form-control" value="${esc(leadDisplayName(lead))}" readonly></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">选择学员</label>${renderCourtDropdownHtml('lead_link_student_id','选择学员',options,lead.studentId||'',true)}</div></div>`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" id="leadLinkStudentBtn" onclick="saveLeadLinkStudent('${leadId}')">确认关联</button>`;
  setCourtModalFrame('关联已有学员',body,actions,'modal-tight');
}
async function saveLeadLinkStudent(leadId){
  const studentId=document.getElementById('lead_link_student_id')?.value||'';
  if(!studentId){toast('请选择学员','warn');return;}
  const btn=document.getElementById('leadLinkStudentBtn');
  if(btn){btn.disabled=true;btn.textContent='关联中…';}
  try{
    await apiCall('POST',`/leads/${leadId}/link-student`,{studentId});
    await refreshLeadRuntime({withStudents:true});
    renderLeads();
    openLeadDetail(leadId);
    toast('学员关联已保存 ✓','success');
  }catch(e){
    toast('关联失败：'+e.message,'error');
    if(btn){btn.disabled=false;btn.textContent='确认关联';}
  }
}
function openLeadLinkCourtModal(leadId){
  const lead=leadById(leadId);
  if(!lead)return;
  const options=[{value:'',label:'- 选择订场用户 -'},...courts.slice().sort((a,b)=>String(a?.name||'').localeCompare(String(b?.name||''))).map(item=>({value:item.id,label:`${item.name}${item.phone?` · ${item.phone}`:''}`}))];
  const body=`<div class="tms-section-header" style="margin-top:0;">关联已有订场用户</div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">线索</label><input class="finput tms-form-control" value="${esc(leadDisplayName(lead))}" readonly></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">选择订场用户</label>${renderCourtDropdownHtml('lead_link_court_id','选择订场用户',options,lead.courtId||'',true)}</div></div>`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" id="leadLinkCourtBtn" onclick="saveLeadLinkCourt('${leadId}')">确认关联</button>`;
  setCourtModalFrame('关联已有订场用户',body,actions,'modal-tight');
}
async function saveLeadLinkCourt(leadId){
  const courtId=document.getElementById('lead_link_court_id')?.value||'';
  if(!courtId){toast('请选择订场用户','warn');return;}
  const btn=document.getElementById('leadLinkCourtBtn');
  if(btn){btn.disabled=true;btn.textContent='关联中…';}
  try{
    await apiCall('POST',`/leads/${leadId}/link-court`,{courtId});
    await refreshLeadRuntime({withCourts:true});
    renderLeads();
    openLeadDetail(leadId);
    toast('订场关联已保存 ✓','success');
  }catch(e){
    toast('关联失败：'+e.message,'error');
    if(btn){btn.disabled=false;btn.textContent='确认关联';}
  }
}
function openLeadConvertModal(leadId){
  const lead=leadById(leadId);
  if(!lead)return;
  const body=`<div class="tms-section-header" style="margin-top:0;">转化动作</div><div class="tms-text-secondary" style="margin-bottom:12px">${esc(leadDisplayName(lead))}</div><div style="display:flex;gap:12px;flex-wrap:wrap"><button class="tms-btn tms-btn-default" onclick="convertLeadToStudent('${leadId}')">转为学员</button><button class="tms-btn tms-btn-default" onclick="convertLeadToCourt('${leadId}')">转为订场用户</button><button class="tms-btn tms-btn-default" onclick="openLeadLinkStudentModal('${leadId}')">关联已有学员</button><button class="tms-btn tms-btn-primary" onclick="openLeadLinkCourtModal('${leadId}')">关联已有订场用户</button></div>`;
  setCourtModalFrame('线索转化',body,`<button class="tms-btn tms-btn-default" onclick="closeModal()">关闭</button>`,'modal-tight');
}
function jumpToLeadDetail(leadId){
  if(!leadId)return;
  if(currentPage!=='leads')goPage('leads');
  setTimeout(()=>openLeadDetail(leadId),120);
}
function leadHasActiveSearchOrFilter(){
  return !!((document.getElementById('leadSearch')?.value||'').trim()||document.getElementById('leadSourceFilter')?.value||document.getElementById('leadConsultFilter')?.value||document.getElementById('leadStatusFilter')?.value||document.getElementById('leadConvertedFilter')?.value||document.getElementById('leadOwnerFilter')?.value||campus!=='all');
}
function leadEmptyStateHtml(){
  const filtered=leadHasActiveSearchOrFilter();
  const title=filtered?'没有匹配的线索':'暂无线索';
  const desc=filtered?'调整搜索或筛选后再试':'点击右上角新增线索开始录入';
  return `<tr><td colspan="12"><div class="tms-empty-state"><div class="tms-empty-title">${title}</div><div class="tms-empty-desc">${desc}</div></div></td></tr>`;
}
function renderLeadPagerControls(total,pages){
  const pager=document.querySelector('#page-leads .tms-pagination');
  if(pager)pager.style.display=total>leadPageSize?'flex':'none';
  const pageSizeHost=document.getElementById('leadPageSize');
  if(pageSizeHost)pageSizeHost.innerHTML=renderPageSizeSelectorHtml('leadPageSizeValue',leadPageSize,'setLeadPageSize');
  const btns=document.getElementById('leadPagerBtns');
  if(!btns)return;
  if(!total||pages<=1){btns.innerHTML='';return;}
  const pageBtns=leadPageNumbers(leadPage,pages).map(item=>item==='...'
    ?'<span class="tms-page-ellipsis">...</span>'
    :`<div class="tms-page-btn${item===leadPage?' active':''}" onclick="leadPage=${item};renderLeads()">${item}</div>`
  ).join('');
  btns.innerHTML=`<div class="tms-page-btn" onclick="leadPage=Math.max(1,leadPage-1);renderLeads()">${renderPagerChevron('prev')}</div>${pageBtns}<div class="tms-page-btn" onclick="leadPage=Math.min(${pages},leadPage+1);renderLeads()">${renderPagerChevron('next')}</div>`;
}
function jumpLeadPage(value){
  const total=getFilteredLeads().length;
  const pages=Math.max(1,Math.ceil(total/leadPageSize));
  leadPage=Math.min(pages,Math.max(1,parseInt(value,10)||1));
  renderLeads();
}
function renderLeads(){
  renderLeadDateScopeControls();
  renderLeadToolbarFilters();
  updateLeadSortHeaders();
  const list=getSortedLeads(getFilteredLeads());
  renderLeadStats(list);
  const total=list.length;
  const pageSize=leadPageSize||20;
  const pages=Math.max(1,Math.ceil(total/pageSize));
  if(leadPage>pages)leadPage=pages;
  const slice=list.slice((leadPage-1)*pageSize,leadPage*pageSize);
  const tbody=document.getElementById('leadTbody');
  if(!tbody)return;
  tbody.innerHTML=slice.length?slice.map(lead=>{
    const trialDate=leadTrialDateText(lead);
    return `<tr><td class="tms-sticky-l" style="padding-left:20px">${renderCourtCellText(leadWechatText(lead),false)}</td><td>${renderCourtCellText(leadDateOnly(lead?.leadDate,lead)||'-',!lead?.leadDate)}</td><td>${renderLeadTag(lead?.source,'source')}</td><td><div class="tms-text-remark tms-text-remark-1" title="${esc(leadProfileText(lead))}">${esc(renderCourtEmptyText(leadProfileText(lead)))}</div></td><td>${renderLeadTag(lead?.consultType,'consult')}</td><td>${renderLeadTag(lead?.owner,'owner')}</td><td>${renderLeadTag(leadFollowupStatusText(lead),'status')}</td><td>${renderCourtCellText(trialDate,trialDate==='-')}</td><td>${renderLeadTag(leadConvertedYesNo(lead),'converted')}</td><td>${renderCourtCellText(lead?.formalCoach||'-',!lead?.formalCoach)}</td><td><div class="tms-text-remark tms-text-remark-1" title="${esc(lead?.lostReason||'')}">${esc(renderCourtEmptyText(lead?.lostReason))}</div></td><td class="tms-sticky-r tms-action-cell" style="width:150px;padding-right:20px"><span class="tms-action-link" onclick="openLeadDetail('${lead.id}')">查看</span><span class="tms-action-link" onclick="openLeadFollowupModal('${lead.id}')">跟进</span><span class="tms-action-link" onclick="openLeadConvertModal('${lead.id}')">转化</span></td></tr>`;
  }).join(''):leadEmptyStateHtml();
  const info=document.getElementById('leadPagerInfo');
  if(info)info.innerHTML=renderPagerInfoHtml(total);
  renderLeadPagerControls(total,pages);
}
function applyLeadSearch(){
  leadPage=1;
  renderLeads();
}
function onLeadFilterChange(){
  leadPage=1;
  renderLeads();
}
function resetLeadFilters(){
  const ids=['leadSearch','leadSourceFilter','leadConsultFilter','leadStatusFilter','leadConvertedFilter','leadOwnerFilter'];
  ids.forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  leadDatePreset='all';
  leadDateCustomStart='';
  leadDateCustomEnd='';
  leadPage=1;
  renderLeads();
}
function setLeadPageSize(value){
  const next=parseInt(value,10);
  leadPageSize=[20,50,100].includes(next)?next:20;
  leadPage=1;
  renderLeads();
}
