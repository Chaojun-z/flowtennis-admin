const LEAD_FIXED_OWNER_NAMES=['Mira','吴敌','陈丹丹','岳克舟'];
let leadImportState={fileName:'',fileSize:0,fileModified:0,csvText:'',previewRows:[],summary:null,error:''};
let leadMergeState={primaryLeadId:'',selectedDuplicateId:'',search:'',preview:null};
let leadDatePreset='all',leadDateCustomStart='',leadDateCustomEnd='';
let leadDetailActiveTab='basic',leadDetailEditingSection='',leadDetailEditingFollowupId='',leadDetailConversionMode='';
let leadListReloadSeq=0,leadListReloading=false;
function leadRawRows(){
  return Array.isArray(leads)?leads:[];
}
function leadNormalizeOwnerName(value){
  return String(value||'').trim().replace(/^@+/,'').trim();
}
function leadOwnerText(lead){
  return leadNormalizeOwnerName(lead?.owner)||'-';
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
  return leadNormalizeOwnerName(item?.followupBy)||'未填写';
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
  const convertedRow=rows.find(item=>leadFollowupConvertedText(item)==='已成交')||base;
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
    leadDedupText(leadSourceText(lead)),
    leadDedupText(leadDemandProductText(lead))
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
  return (rows||[]).filter(row=>!['merged','voided','deleted'].includes(String(row?.status||'').trim()));
}
function leadWechatText(lead){
  return String(lead?.wechatName||lead?.displayName||'-').trim()||'-';
}
function leadSortCreatedValue(lead){
  return leadSortDateValue(lead?.createdAt,lead);
}
function leadRows(){
  return mergeDuplicateLeadRows(leadRawRows()).sort((a,b)=>{
    const createdDiff=leadSortCreatedValue(b)-leadSortCreatedValue(a);
    if(createdDiff!==0)return createdDiff;
    return String(b?.id||'').localeCompare(String(a?.id||''));
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
function leadStandardField(lead,key){
  const lifecycle=typeof customerLifecycleForRecord==='function'?customerLifecycleForRecord(lead):null;
  return String(lifecycle?.[key]||lead?.[key]||'').trim();
}
function leadNormalizeDealType(value){
  const raw=String(value||'').trim();
  if(!raw||raw==='未转化'||raw==='未成交')return '';
  const standard=['课程','订场','订场会员','陪打','课程+订场','课程+订场会员','订场+订场会员','订场+陪打','课程+订场+订场会员'];
  if(standard.includes(raw))return raw;
  const normalized=raw.replace(/已转/g,'').replace(/转化/g,'').replace(/成交/g,'').replace(/\s/g,'').replace(/会员/g,'订场会员').replace(/订场订场会员/g,'订场会员').replace(/订场陪打/g,'订场+陪打');
  return standard.includes(normalized)?normalized:'';
}
function leadStandardDealTypeText(lead){
  return leadNormalizeDealType(leadStandardField(lead,'dealType')||leadStandardField(lead,'conversionType'));
}
function leadDealTypeText(lead){
  return leadStandardDealTypeText(lead);
}
function leadConversionText(lead){
  return leadDealTypeText(lead)||'未成交';
}
function leadConversionTypeText(lead){
  return leadDealTypeText(lead);
}
function leadStageText(lead){
  const status=leadStandardField(lead,'leadStage')||String(lead?.systemStatus||lead?.rawStatus||'').trim();
  if(status==='未转化'||status==='未成交')return '跟进中';
  if(status==='已流失'||status==='无意向')return '已流失';
  if(status==='已约体验'||status==='体验课预约')return '已约体验';
  if(status==='体验课完成'||status==='已体验待转化'||status==='已体验待成交'||leadTrialDone(lead))return '已体验待成交';
  if(status==='已成交'||/已报名|已转|成交/.test(status))return '已成交';
  if(status==='新线索')return '新线索';
  return '跟进中';
}
function leadStageDisplayText(lead){
  const stage=leadStageText(lead);
  const dealType=leadDealTypeText(lead);
  return stage==='已成交'&&dealType?`已成交 · ${dealType}`:stage;
}
function leadConvertedYesNo(lead){
  return lead?.convertedFlag===true||leadStageText(lead)==='已成交'?'是':'否';
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
function leadLevelCanonicalValue(value){
  const text=String(value??'').trim();
  if(['1','2','3','4','5'].includes(text))return `${text}.0`;
  return text;
}
function leadLevelText(lead){
  return leadLevelCanonicalValue(lead?.level)||'-';
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
function leadDateInputValue(lead){
  return leadDateOnly(leadBusinessDateValue(lead),lead)||today();
}
function leadBusinessDateValue(lead={}){
  return lead?.leadDate||lead?.leadEnteredAt||lead?.firstTouchAt||lead?.trialAtRaw||lead?.trialBookedAt||lead?.trialAttendedAt||lead?.courseFirstPurchaseAt||lead?.conversionAt||lead?.enrollAtRaw||lead?.formalSignupAt||lead?.createdAt||lead?.updatedAt||lead?.lastFollowupAt;
}
function leadDateDisplayText(lead){
  return leadDateOnly(leadBusinessDateValue(lead),lead)||'-';
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
  return !!(lead?.studentId||lead?.isCourseConverted||/已报名|已转课程|课程/.test(status));
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
  if(/已报名|已定场|定场|已转|成交/.test(status))return '已成交';
  if(status==='已流失'||status==='无意向')return '已流失';
  if(status==='体验课完成'||status==='已体验待成交'||status==='已体验待转化')return '已体验待成交';
  if(status==='已约体验'||status==='体验课预约')return '已约体验';
  return status||'跟进中';
}
function leadNowInputValue(){
  const d=new Date();
  const pad=v=>String(v).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function leadFollowupDateInputValue(value,lead={}){
  const raw=String(value||'').trim();
  return leadDateOnly(raw,lead)||raw.slice(0,10)||today();
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
  if(typeof standardBusinessTagClass==='function'&&['source','customerType','demandProduct','consult','stage','priority'].includes(kind))return standardBusinessTagClass(kind,text);
  if(kind==='source')return text==='大众点评'?'tms-tag-tier-blue':/小红书/.test(text)?'tms-tag-red':text==='线下到店'?'tms-tag-tier-gold':text==='转介绍'?'tms-tag-tier-teal':'tms-tag-tier-slate';
  if(kind==='customerType')return text==='青少年'?'tms-tag-tier-blue':text==='成人'?'tms-tag-tier-teal':'tms-tag-tier-slate';
  if(kind==='demandProduct'||kind==='consult')return /私教/.test(text)?'tms-tag-green':/小班/.test(text)?'tms-tag-tier-blue':/订场|场地/.test(text)?'tms-tag-tier-teal':/会员/.test(text)?'tms-tag-tier-gold':/陪打|约球|穿线|合作/.test(text)?'tms-tag-red':'tms-tag-tier-slate';
  if(kind==='intent')return /^高/.test(text)?'tms-tag-green':/^中/.test(text)?'tms-tag-tier-blue':/^低/.test(text)?'tms-tag-tier-gold':/沉默/.test(text)?'tms-tag-tier-slate':'tms-tag-tier-slate';
  if(kind==='owner')return 'tms-tag-tier-teal';
  if(kind==='priority'){
    if(text==='P0')return 'tms-tag-red';
    if(text==='P1')return 'tms-tag-tier-gold';
    if(text==='P2')return 'tms-tag-tier-blue';
    if(text==='P3')return 'tms-tag-tier-teal';
    return 'tms-tag-tier-slate';
  }
  if(kind==='converted')return text==='是'?'tms-tag-green':'tms-tag-tier-slate';
  if(kind==='dealType'||kind==='conversion'||kind==='conversionType'){
    if(text==='未成交')return 'tms-tag-tier-slate';
    if(/课程\+订场|课程\+订场会员|订场\+订场会员|课程\+订场\+订场会员/.test(text))return 'tms-tag-tier-gold';
    if(text==='课程')return 'tms-tag-green';
    if(text==='订场'||text==='订场会员')return 'tms-tag-tier-blue';
    return 'tms-tag-tier-slate';
  }
  if(kind==='stage'){
    if(text==='跟进中')return 'tms-tag-tier-slate';
    if(text==='已流失')return 'tms-tag-lead-no-intent';
    if(text==='已约体验')return 'tms-tag-lead-trial-booked';
    if(text==='已体验待成交')return 'tms-tag-lead-trial-done';
    if(text.startsWith('已成交'))return 'tms-tag-green';
    return text==='新线索'?'tms-tag-lead-new':'tms-tag-tier-slate';
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
    if(text==='已成交')return 'tms-tag-green';
    if(text==='已约体验')return 'tms-tag-tier-teal';
    if(text==='已约体验课')return 'tms-tag-lead-trial-booked';
    return 'tms-tag-tier-gold';
  }
  return 'tms-tag-tier-slate';
}
function renderLeadTag(value,kind){
  const text=String(value||'').trim()||'-';
  if(typeof renderStandardBusinessTag==='function'&&['source','customerType','demandProduct','consult','stage','priority'].includes(kind))return renderStandardBusinessTag(text,kind);
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
  return FlowTennisBusinessTaxonomy.optionList('leadSources');
}
function leadConsultOptions(){
  return leadDemandProductOptions();
}
function leadCustomerTypeOptions(){
  return FlowTennisBusinessTaxonomy.optionList('leadCustomerTypes');
}
function leadDemandProductOptions(){
  return FlowTennisBusinessTaxonomy.optionList('leadDemandProducts');
}
function leadSourceText(lead){
  return FlowTennisBusinessTaxonomy.normalizeLeadSource(lead?.source);
}
function leadCustomerTypeText(lead){
  return FlowTennisBusinessTaxonomy.normalizeLeadCustomerType(lead?.customerType||lead?.consultType||lead?.demandProduct||lead?.profileNote);
}
function leadDemandProductText(lead){
  return FlowTennisBusinessTaxonomy.normalizeLeadDemandProduct(lead?.demandProduct||lead?.consultType);
}
function leadConsultText(lead){
  return leadDemandProductText(lead);
}
function leadIntentOptions(){
  return FlowTennisBusinessTaxonomy.optionList('leadIntentLevels');
}
function leadPriorityOptions(){
  return ['P0','P1','P2','P3','P4'].map(value=>({value,label:value}));
}
function leadPriorityText(lead){
  const value=String(lead?.followupPriority||'').trim().toUpperCase();
  return /^P[0-4]$/.test(value)?value:'-';
}
function renderLeadPriorityCell(lead){
  const priority=leadPriorityText(lead);
  return priority==='-'?renderStandardCellText('-',true):renderLeadTag(priority,'priority');
}
function leadLevelOptions(){
  return FlowTennisBusinessTaxonomy.optionList('leadLevels');
}
function leadFollowupTypeOptions(){
  return LEAD_FOLLOWUP_TYPE_OPTIONS;
}
function leadDealTypeOptions(){
  return [{value:'',label:'-'},...FlowTennisBusinessTaxonomy.optionList('leadDealTypes')];
}
function leadStageOptions(){
  const preferred=FlowTennisBusinessTaxonomy.values('leadStages');
  if(preferred.length)return preferred.map(value=>({value,label:value}));
  return LEAD_STATUS_AFTER_OPTIONS;
}
function leadStatusAfterOptions(){
  return leadStageOptions();
}
function leadLevelPresetValue(value){
  const text=leadLevelCanonicalValue(value);
  if(!text)return '';
  return leadLevelOptions().some(opt=>opt.value===text)?text:'自定义';
}
function leadLevelCustomValue(value){
  const text=leadLevelCanonicalValue(value);
  if(!text||leadLevelOptions().some(opt=>opt.value===text))return '';
  return text;
}
function leadEmptyDropdownOption(){
  return {value:'',label:'-',emptyDisplay:' '};
}
function leadLevelControlHtml(lead){
  const raw=leadLevelCanonicalValue(lead?.level);
  const preset=leadLevelPresetValue(raw);
  const custom=leadLevelCustomValue(raw);
  return `${renderStandardDropdownHtml('lead_level','水平',[leadEmptyDropdownOption(),...leadLevelOptions()],preset,true,'toggleLeadLevelCustomInput')}<input class="finput tms-form-control" id="lead_level_custom" value="${esc(custom)}" placeholder="请输入水平" style="display:${preset==='自定义'?'block':'none'};margin-top:8px">`;
}
function toggleLeadLevelCustomInput(value){
  const levelValue=value||document.getElementById('lead_level')?.value||'';
  const input=document.getElementById('lead_level_custom');
  if(!input)return;
  input.style.display=levelValue==='自定义'?'block':'none';
  if(levelValue!=='自定义')input.value='';
}
function leadOwnerOptions(){
  return leadOwnerOptionNames().map(value=>({value,label:value}));
}
function leadOwnerOptionNames(){
  return Array.from(new Set([...LEAD_FIXED_OWNER_NAMES,...activeCoachNames()].map(leadNormalizeOwnerName).filter(Boolean)));
}
function leadCampusText(lead){
  const value=typeof customerLifecycleCampus==='function'?customerLifecycleCampus(lead,lead?.campus):lead?.campus;
  return (typeof cn==='function'?cn(value):campusDisplayName(value))||'-';
}
function leadCampusOptions(){
  return campuses.map(c=>({value:c.code||c.id,label:campusDisplayName(c.name||c.code||c.id)}));
}
function leadDefaultCampusValue(){
  return campus!=='all'?campus:(leadCampusOptions().find(option=>option.value)?.value||'');
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
  const date=leadDateOnly(leadBusinessDateValue(lead),lead);
  if(!date)return false;
  if(start&&date<start)return false;
  if(end&&date>end)return false;
  return true;
}
function leadGlobalDateValue(lead){
  return leadDateOnly(leadBusinessDateValue(lead),lead)||lead?.createdAt||lead?.updatedAt||lead?.lastFollowupAt;
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
  leadPage=standardListFirstPage();
  reloadLeadsForCurrentPage();
}
function setLeadCustomDateRange(){
  leadDatePreset='custom';
  leadDateCustomStart=document.getElementById('leadDateFrom')?.value||'';
  leadDateCustomEnd=document.getElementById('leadDateTo')?.value||'';
  leadPage=standardListFirstPage();
  reloadLeadsForCurrentPage();
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
  if(key==='leadDate')return leadSortDateValue(leadBusinessDateValue(lead),lead);
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
  leadPage=standardListFirstPage();
  reloadLeadsForCurrentPage();
}
function updateLeadSortHeaders(){
  document.querySelectorAll('#page-leads [data-lead-sort]').forEach(btn=>{
    const active=btn.dataset.leadSort===leadSortKey;
    btn.classList.toggle('asc',active&&leadSortDir==='asc');
    btn.classList.toggle('desc',active&&leadSortDir==='desc');
  });
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
function leadOwnerFilterValues(){
  return [...document.querySelectorAll('.lead-owner-filter-cb:checked')].map(cb=>leadNormalizeOwnerName(cb.value)).filter(Boolean);
}
function leadOwnerFilterHtml(options=[],selectedValues=[]){
  const selected=new Set(selectedValues);
  const values=options.map(opt=>typeof opt==='string'?{value:opt,label:opt}:opt).filter(opt=>String(opt.value||''));
  const display=selected.size?`跟进人 ${selected.size}`:'跟进人';
  return `<div class="tms-dropdown${selected.size?' has-value':''}" id="leadOwnerFilter_dropdown" data-target="leadOwnerFilter" onclick="toggleStandardDropdown('leadOwnerFilter',event)"><input type="hidden" id="leadOwnerFilter" value="${esc([...selected].join(','))}"><div class="tms-dropdown-display">${esc(display)}</div><div class="tms-dropdown-menu" style="touch-action:pan-y;-webkit-overflow-scrolling:touch" onclick="event.stopPropagation()" onwheel="event.stopPropagation();event.preventDefault();this.scrollTop += event.deltaY" ontouchmove="event.stopPropagation()">${values.map(opt=>`<label class="tms-dropdown-item" style="gap:8px" onclick="event.stopPropagation()"><input type="checkbox" class="tms-checkbox lead-owner-filter-cb" value="${esc(opt.value)}" ${selected.has(String(opt.value))?'checked':''} onchange="toggleLeadOwnerFilter()"><span>${esc(renderStandardOptionLabel(opt))}</span></label>`).join('')}</div></div>`;
}
function toggleLeadOwnerFilter(){
  leadPage=standardListFirstPage();
  reloadLeadsForCurrentPage();
}
function getFilteredLeads(){
  const q=(document.getElementById('leadSearch')?.value||'').trim().toLowerCase();
  const sourceValue=document.getElementById('leadSourceFilter')?.value||'';
  const customerTypeValue=document.getElementById('leadCustomerTypeFilter')?.value||'';
  const consultValue=document.getElementById('leadConsultFilter')?.value||'';
  const stageValue=document.getElementById('leadStageFilter')?.value||'';
  const dealTypeValue=document.getElementById('leadDealTypeFilter')?.value||'';
  const ownerValues=leadOwnerFilterValues();
  const campusValue=campus;
  return leadRows().filter(lead=>{
    if(!leadInDateRange(lead,getLeadDateFilterRange()))return false;
    if(!globalDateWithinRange(leadGlobalDateValue(lead)))return false;
    if(!searchHit(q,leadDisplayName(lead),lead?.phone,lead?.wechatName))return false;
    if(sourceValue&&leadSourceText(lead)!==sourceValue)return false;
    if(customerTypeValue&&leadCustomerTypeText(lead)!==customerTypeValue)return false;
    if(consultValue&&leadConsultText(lead)!==consultValue)return false;
    if(stageValue&&leadStageText(lead)!==stageValue)return false;
    if(dealTypeValue&&leadDealTypeText(lead)!==dealTypeValue)return false;
    if(ownerValues.length&&!ownerValues.includes(leadOwnerText(lead)))return false;
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
function leadServerFilterCounts(){
  const filters=typeof leadListPageData==='object'&&leadListPageData?leadListPageData.filters:null;
  return filters&&typeof filters==='object'?filters:null;
}
function leadOptionsWithServerCounts(key,options=[],fallbackOptions=[]){
  const field=leadServerFilterCounts()?.[key];
  if(!field||!field.counts)return fallbackOptions.length?fallbackOptions:options;
  const counts=field.counts||{};
  const total=Number(field.total)||0;
  return (options||[]).map(opt=>{
    const item=typeof opt==='string'?{value:opt,label:opt}:opt;
    const value=String(item.value||'');
    const count=value===''?total:(Number(counts[value])||0);
    return {...item,count};
  }).filter(opt=>String(opt.value||'')===''||opt.count>0);
}
function renderLeadToolbarFilters(){
  const rows=leadRows().filter(lead=>leadInDateRange(lead,getLeadDateFilterRange())&&globalDateWithinRange(leadGlobalDateValue(lead))&&(campus==='all'||sameCampusValue(lead?.campus,campus)));
  const sourceValue=document.getElementById('leadSourceFilter')?.value||'';
  const customerTypeValue=document.getElementById('leadCustomerTypeFilter')?.value||'';
  const consultValue=document.getElementById('leadConsultFilter')?.value||'';
  const stageValue=document.getElementById('leadStageFilter')?.value||'';
  const dealTypeValue=document.getElementById('leadDealTypeFilter')?.value||'';
  const ownerValues=leadOwnerFilterValues();
  const linked=withLinkedFilterCounts([
    {key:'source',value:sourceValue,options:[{value:'',label:'全部',emptyDisplay:'来源'},...leadSourceOptions()],match:(lead,value)=>leadSourceText(lead)===String(value)},
    {key:'customerType',value:customerTypeValue,options:[{value:'',label:'全部',emptyDisplay:'类型'},...leadCustomerTypeOptions()],match:(lead,value)=>leadCustomerTypeText(lead)===String(value)},
    {key:'consult',value:consultValue,options:[{value:'',label:'全部',emptyDisplay:'需求'},...leadDemandProductOptions()],match:(lead,value)=>leadDemandProductText(lead)===String(value)},
    {key:'stage',value:stageValue,options:[{value:'',label:'全部',emptyDisplay:'线索阶段'},...leadStageOptions()],match:(lead,value)=>leadStageText(lead)===String(value)},
    {key:'dealType',value:dealTypeValue,options:[{value:'',label:'全部',emptyDisplay:'转化类型'},...leadDealTypeOptions().filter(option=>String(option.value||''))],match:(lead,value)=>leadDealTypeText(lead)===String(value)}
  ],rows);
  const configs=[
    ['leadSourceFilterHost','leadSourceFilter','来源',leadOptionsWithServerCounts('source',[{value:'',label:'全部',emptyDisplay:'来源'},...leadSourceOptions()],linked.source.options),linked.source.value],
    ['leadCustomerTypeFilterHost','leadCustomerTypeFilter','类型',leadOptionsWithServerCounts('customerType',[{value:'',label:'全部',emptyDisplay:'类型'},...leadCustomerTypeOptions()],linked.customerType.options),linked.customerType.value],
    ['leadConsultFilterHost','leadConsultFilter','需求',leadOptionsWithServerCounts('consult',[{value:'',label:'全部',emptyDisplay:'需求'},...leadDemandProductOptions()],linked.consult.options),linked.consult.value],
    ['leadStageFilterHost','leadStageFilter','线索阶段',leadOptionsWithServerCounts('stage',[{value:'',label:'全部',emptyDisplay:'线索阶段'},...leadStageOptions()],linked.stage.options),linked.stage.value],
    ['leadDealTypeFilterHost','leadDealTypeFilter','转化类型',leadOptionsWithServerCounts('dealType',[{value:'',label:'全部',emptyDisplay:'转化类型'},...leadDealTypeOptions().filter(option=>String(option.value||''))],linked.dealType.options),linked.dealType.value]
  ];
  configs.forEach(([hostId,id,label,options,value])=>{
    const host=document.getElementById(hostId);
    if(host)host.innerHTML=renderStandardDropdownHtml(id,label,options,value,false,'onLeadFilterChange');
  });
  const ownerHost=document.getElementById('leadOwnerFilterHost');
  if(ownerHost)ownerHost.innerHTML=leadOwnerFilterHtml(leadOptionsWithServerCounts('owner',leadOwnerOptions(),leadOwnerOptions()),ownerValues);
}
function leadConverted(lead){
  return leadConvertedYesNo(lead)==='是';
}
function leadRateText(value,total){
  return FlowTennisPlatformDataStandards.rateText(Number(value)||0,Number(total)||0);
}
function leadStandardMetrics(){
  return typeof standardLifecycleMetrics==='object'&&standardLifecycleMetrics?standardLifecycleMetrics:{metrics:{}};
}
function leadStandardMetric(key){
  return leadStandardMetrics().metrics?.[key]||null;
}
function leadStandardMetricValue(key){
  return Number(leadStandardMetric(key)?.value)||0;
}
function leadTeachingSummaryValue(key){
  if(!leadLifecycleMetricsReady())return null;
  const standard=leadStandardMetrics();
  const views=typeof teachingStudentViews==='object'&&teachingStudentViews?teachingStudentViews:{summary:{}};
  const value=standard.teachingSummary?.[key]??views.summary?.[key];
  return value==null?null:Number(value)||0;
}
function leadLifecycleMetricsReady(){
  if(typeof lifecycleMetricsReady==='function')return lifecycleMetricsReady();
  if(typeof datasetHasCurrentRequestKey==='function')return datasetHasCurrentRequestKey('lifecycleMetricsPage');
  return true;
}
function leadStatsLoadingData(){
  return {
    total:null,
    historicalStudents:null,
    historicalStudentRate:'',
    activeStudents:null,
    activeStudentRate:'',
    trialAttended:null,
    trialAttendedRate:'',
    trialAttendedToFormalPurchase:null,
    trialAttendedToFormalPurchaseRate:''
  };
}
function leadStandardMetricRate(key,fallbackValue,fallbackTotal){
  if(fallbackValue==null)return '';
  const metric=leadStandardMetric(key);
  return metric?.rateText||leadRateText(fallbackValue,fallbackTotal);
}
function leadCurrentListRateText(value,total){
  if(value==null)return '';
  return FlowTennisPlatformDataStandards.rateText(Number(value)||0,Number(total)||0);
}
function renderLeadStatsLoading(){
  const host=document.getElementById('leadStatsRow');
  if(host&&typeof renderStandardSkeletonKpiCards==='function')host.innerHTML=renderStandardSkeletonKpiCards(5);
}
function leadTrialDoneByStatus(lead){
  return [lead?.rawStatus,lead?.systemStatus,lead?.leadStage].some(value=>['体验课完成','已体验待转化','已体验待成交'].includes(String(value||'').trim()));
}
function leadTrialDoneByTime(lead){
  const raw=leadStandardField(lead,'trialAttendedAt')||lead?.trialAttendedAt;
  const date=leadDateOnly(raw,lead);
  return !!date&&date<=today();
}
function leadTrialDone(lead){
  if(Object.prototype.hasOwnProperty.call(lead||{},'hasTrialAttended'))return lead?.hasTrialAttended===true;
  return leadTrialDoneByStatus(lead)||leadTrialDoneByTime(lead);
}
function leadTrialBooked(lead){
  if(Object.prototype.hasOwnProperty.call(lead||{},'hasTrialBooked'))return lead?.hasTrialBooked===true;
  const lifecycle=typeof customerLifecycleForRecord==='function'?customerLifecycleForRecord(lead):null;
  if([lifecycle?.trialBookedAt,lifecycle?.trialAtRaw,lead?.trialBookedAt,lead?.trialAtRaw,lead?.trialLessonAt,lead?.trialAt].some(value=>String(value||'').trim()))return true;
  if([lead?.rawStatus,lead?.systemStatus,lead?.leadStage].some(value=>['已约体验','体验课预约'].includes(String(value||'').trim())))return true;
  return leadTrialDone(lead);
}
function leadCourseConverted(lead){
  if(Object.prototype.hasOwnProperty.call(lead||{},'hasCourseConversion'))return lead?.hasCourseConversion===true;
  const lifecycle=typeof customerLifecycleForRecord==='function'?customerLifecycleForRecord(lead):null;
  if(lifecycle?.hasCourseConversion===true)return true;
  if(String(lifecycle?.studentStage||lead?.studentStage||'').trim()==='formal')return true;
  return leadDealTypeText(lead).split('+').includes('课程');
}
function leadTrialCourseConverted(lead){
  if(Object.prototype.hasOwnProperty.call(lead||{},'hasTrialToCourseConversion'))return lead?.hasTrialToCourseConversion===true;
  return leadTrialDone(lead)&&leadCourseConverted(lead);
}
function leadServerSummaryData(){
  const summary=typeof leadListPageData==='object'&&leadListPageData?leadListPageData.summary:null;
  if(!summary||summary.total==null)return null;
  return summary;
}
function leadCustomerCenterSummaryData(){
  if(typeof datasetHasCurrentRequestKey==='function'&&!datasetHasCurrentRequestKey('customerCenterPage'))return null;
  const summary=teachingStudentViews?.summary;
  if(!summary||typeof summary!=='object')return null;
  return summary;
}
function leadStatsData(list){
  const serverSummary=leadServerSummaryData();
  const total=serverSummary?.total??null;
  const historicalStudents=serverSummary?.historicalStudents;
  const activeStudents=serverSummary?.activeStudents;
  const trialAttended=serverSummary?.trialAttended;
  const trialAttendedToFormalPurchase=serverSummary?.trialAttendedToFormalPurchase;
  if([total,historicalStudents,activeStudents,trialAttended,trialAttendedToFormalPurchase].some(value=>value==null))return leadStatsLoadingData();
  const historical=Number(historicalStudents);
  const active=Number(activeStudents);
  const trial=Number(trialAttended);
  const formal=Number(trialAttendedToFormalPurchase);
  return {
    total,
    historicalStudents:Number.isFinite(historical)?historical:null,
    historicalStudentRate:Number.isFinite(historical)?leadCurrentListRateText(historical,total):'',
    activeStudents:Number.isFinite(active)?active:null,
    activeStudentRate:Number.isFinite(active)&&Number.isFinite(historical)?leadCurrentListRateText(active,historical):'',
    trialAttended:Number.isFinite(trial)?trial:null,
    trialAttendedRate:Number.isFinite(trial)?leadCurrentListRateText(trial,total):'',
    trialAttendedToFormalPurchase:Number.isFinite(formal)?formal:null,
    trialAttendedToFormalPurchaseRate:Number.isFinite(formal)&&Number.isFinite(trial)?leadCurrentListRateText(formal,trial):''
  };
}
function renderLeadStats(list){
  const stats=leadStatsData(list);
  const statValues=['total','historicalStudents','activeStudents','trialAttended','trialAttendedToFormalPurchase'];
  if(statValues.some(key=>stats[key]==null)){
    renderLeadStatsLoading();
    return;
  }
  const cardData=[
    {label:'线索数',valueHtml:`${stats.total}<span>条</span>`},
    {label:'历史学员',valueHtml:stats.historicalStudents,percent:stats.historicalStudentRate,sub:'历史学员 / 线索数'},
    {label:'在期学员',valueHtml:stats.activeStudents,percent:stats.activeStudentRate,sub:'在期学员 / 历史学员'},
    {label:'上过体验课',valueHtml:stats.trialAttended,percent:stats.trialAttendedRate,sub:'上过体验课 / 线索数'},
    {label:'体验后买正式课',valueHtml:stats.trialAttendedToFormalPurchase,percent:stats.trialAttendedToFormalPurchaseRate,sub:'体验后买正式课 / 上过体验课'}
  ];
  const host=document.getElementById('leadStatsRow');
  if(host)host.innerHTML=renderStandardDataCards(cardData);
}
function leadTimelineHtml(lead){
  const rows=leadFollowupRows(lead);
  return renderDetailDrawerTimeline(rows.map(item=>leadFollowupTimelineItemHtml(lead,item)),{emptyText:'暂无跟进时间线',className:'lead-followup-timeline'});
}
function leadTimelineLineText(item){
  const date=leadFollowupDateText(item);
  const by=leadFollowupPersonText(item);
  const status=leadFollowupConvertedText(item);
  const note=leadFollowupNoteText(item);
  return `${date} · ${by} 跟进 · （${status}）\n${note}`;
}
function linkedStudentName(lead){
  const studentId=String(lead?.studentId||'').trim();
  const stu=students.find(item=>String(item?.id||'')===studentId);
  return stu?.name||lead?.studentName||lead?.studentMatchName||leadDisplayName(lead)||'-';
}
function linkedCourtName(lead){
  const courtId=String(lead?.courtId||'').trim();
  const court=courts.find(item=>String(item?.id||'')===courtId);
  return court?.name||lead?.courtName||lead?.courtMatchName||leadDisplayName(lead)||'-';
}
function linkedCoachName(value){
  const raw=String(value||'').trim();
  if(!raw)return '-';
  const coach=(Array.isArray(coaches)?coaches:[]).find(item=>String(item?.id||'')===raw||coachName(item?.name)===coachName(raw));
  return coachName(coach?.name||raw)||'-';
}
function leadNeedsLookup(rows,id){
  const raw=String(id||'').trim();
  return !!raw&&!(Array.isArray(rows)&&rows.length);
}
function ensureLeadConversionLookups(leadId){
  if(leadDetailActiveTab!=='conversion')return;
  const lead=leadById(leadId);
  if(!lead)return;
  const needed=[];
  if((leadDetailConversionMode==='link-student'&&!(Array.isArray(students)&&students.length))||leadNeedsLookup(students,lead?.studentId))needed.push('students');
  if((leadDetailConversionMode==='link-court'&&!(Array.isArray(courts)&&courts.length))||leadNeedsLookup(courts,lead?.courtId))needed.push('courts');
  if((leadStandardField(lead,'formalCoach')||leadFormalPackageCoach(lead))&&!(Array.isArray(coaches)&&coaches.length))needed.push('coaches');
  if(!needed.length)return;
  ensureDatasetsByName([...new Set(needed)],{force:false}).then(()=>{
    const currentId=document.getElementById('overlay')?.dataset.leadDetailId||'';
    if(currentId===String(leadId)&&leadDetailActiveTab==='conversion')openLeadDetail(leadId);
  }).catch(e=>console.warn('lead conversion lookup skipped',e));
}
function leadDetailHeroHtml(lead,options={}){
  const createMode=options.createMode===true;
  return renderDetailDrawerHero({
    title:leadDisplayName(lead),
    avatar:leadDisplayName(lead).slice(0,1)||'线',
    subtitle:createMode?'':[leadCampusText(lead),leadSourceText(lead),leadCustomerTypeText(lead),leadDemandProductText(lead)].filter(Boolean).join(' · '),
    statusHtml:createMode?'':renderLeadTag(leadStageDisplayText(lead),'stage')
  });
}
function leadDetailTabsHtml(active='basic',options={}){
  const createMode=options.createMode===true;
  const tabs=createMode?[['basic','基础信息']]:[['basic','基础信息'],['followups','跟进记录'],['conversion','成交信息']];
  return renderDetailDrawerTabs(active,tabs,{onClick:'setLeadDetailTab'});
}
function setLeadDetailTab(tab){
  leadDetailActiveTab=['basic','followups','conversion'].includes(tab)?tab:'basic';
  leadDetailEditingSection='';
  leadDetailEditingFollowupId='';
  leadDetailConversionMode='';
  const id=document.getElementById('overlay')?.dataset.leadDetailId||'';
  if(id)openLeadDetail(id);
}
function leadFollowupDetailNeedsLoad(leadId){
  return leadDetailActiveTab==='followups'&&typeof leadFollowupsDetailReady==='function'&&!leadFollowupsDetailReady(leadId);
}
function loadLeadFollowupDetailThenOpen(leadId){
  if(typeof ensureLeadFollowupsForLead!=='function')return false;
  const lead=leadById(leadId);if(!lead)return false;
  openStandardDetailDrawer({
    titleHtml:`${leadDetailHeroHtml(lead)}${leadDetailTabsHtml(leadDetailActiveTab)}`,
    bodyHtml:'<div class="schedule-detail-content"><div class="empty"><p>跟进记录加载中...</p></div></div>',
    actionsHtml:'',
    data:{leadDetailId:lead.id},
    overlayClasses:['schedule-drawer-overlay'],
    modalClass:'modal modal-court modal-schedule-drawer modal-lead-drawer'
  });
  ensureLeadFollowupsForLead(leadId).then(()=>{
    const currentId=document.getElementById('overlay')?.dataset.leadDetailId||'';
    if(currentId===String(leadId)&&leadDetailActiveTab==='followups')openLeadDetail(leadId);
  }).catch(e=>{
    console.warn('lead followups detail load failed',e);
    toast('跟进记录加载失败，请刷新后重试','error');
  });
  return true;
}
function refreshLeadDetailFromServer(leadId){
  if(typeof ensureLeadDetailForLead!=='function')return;
  if(typeof leadDetailReady==='function'&&leadDetailReady(leadId))return;
  ensureLeadDetailForLead(leadId).then(()=>{
    const currentId=document.getElementById('overlay')?.dataset.leadDetailId||'';
    if(currentId===String(leadId))openLeadDetail(leadId);
  }).catch(e=>{
    console.warn('lead detail load failed',e);
    if(typeof toast==='function')toast('线索详情加载失败，已显示当前列表数据','warn');
  });
}
function leadDetailFieldHtml(label,value){
  return renderDetailDrawerField(label,value);
}
function leadDetailBlockHtml(label,html,options={}){
  if(options.hideEmpty&&leadDetailIsEmptyHtml(html))return '';
  return renderDetailDrawerBlock(label,html);
}
function leadDrawerCardHtml(title,content,className='',actionsHtml='',options={}){
  return renderDetailDrawerCard(title,content,{className,actionsHtml,useGrid:options.useGrid!==false,titleHtml:options.titleHtml||''});
}
function leadBasicInfoReadonlyHtml(lead){
  return [
    leadDetailFieldHtml('姓名',leadWechatText(lead)),
    leadDetailFieldHtml('电话',lead?.phone||'-'),
    leadDetailFieldHtml('水平',leadLevelText(lead)),
    leadDetailFieldHtml('线索时间',leadDateDisplayText(lead)),
    leadDetailFieldHtml('来源',leadSourceText(lead)||'-'),
    leadDetailFieldHtml('所属校区',leadCampusText(lead)),
    leadDetailFieldHtml('类型',leadCustomerTypeText(lead)||'-'),
    leadDetailFieldHtml('需求产品',leadDemandProductText(lead)||'-'),
    leadDetailFieldHtml('意向等级',lead?.intentLevel||'-'),
    leadDetailFieldHtml('跟进优先级',leadPriorityText(lead)),
    leadDetailFieldHtml('跟进人',leadOwnerText(lead)),
    leadDetailBlockHtml('基本信息',esc(leadProfileText(lead)),{hideEmpty:true})
  ].join('');
}
function leadBasicInfoFormHtml(lead){
  return `<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">姓名</label><input class="finput tms-form-control" id="lead_wechatName" value="${esc(lead?.wechatName||lead?.displayName||'')}"></div><div class="tms-form-item"><label class="tms-form-label">电话</label><input class="finput tms-form-control" id="lead_phone" value="${esc(lead?.phone||'')}"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">水平</label>${leadLevelControlHtml(lead)}</div><div class="tms-form-item"><label class="tms-form-label">线索时间</label>${courtDateButtonHtml('lead_leadDate',leadDateInputValue(lead),'线索时间')}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">来源</label>${renderStandardDropdownHtml('lead_source','来源',[leadEmptyDropdownOption(),...leadSourceOptions()],lead?.source?leadSourceText(lead):'',true)}</div><div class="tms-form-item"><label class="tms-form-label">所属校区</label>${renderStandardDropdownHtml('lead_campus','所属校区',[leadEmptyDropdownOption(),...leadCampusOptions()],lead?.campus||'',true)}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">类型</label>${renderStandardDropdownHtml('lead_customerType','类型',[leadEmptyDropdownOption(),...leadCustomerTypeOptions()],lead?.customerType?leadCustomerTypeText(lead):'',true)}</div><div class="tms-form-item"><label class="tms-form-label">需求产品</label>${renderStandardDropdownHtml('lead_demandProduct','需求产品',[leadEmptyDropdownOption(),...leadDemandProductOptions()],lead?.demandProduct||lead?.consultType?leadDemandProductText(lead):'',true)}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">意向等级</label>${renderStandardDropdownHtml('lead_intentLevel','意向等级',[leadEmptyDropdownOption(),...leadIntentOptions()],lead?.intentLevel||'',true)}</div><div class="tms-form-item"><label class="tms-form-label">跟进优先级</label>${renderStandardDropdownHtml('lead_followupPriority','跟进优先级',[leadEmptyDropdownOption(),...leadPriorityOptions()],lead?.followupPriority||'',true)}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">跟进人</label>${renderStandardDropdownHtml('lead_owner','跟进人',[leadEmptyDropdownOption(),...leadOwnerOptions()],leadNormalizeOwnerName(lead?.owner)||'',true)}</div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">基本信息</label><textarea class="finput tms-form-control" id="lead_profileNote">${esc(lead?.profileNote||'')}</textarea></div></div>`;
}
function leadPayloadFromForm(){
  const displayName=document.getElementById('lead_wechatName')?.value?.trim?.()||'';
  const phone=document.getElementById('lead_phone')?.value?.trim?.()||'';
  const wechatName=displayName;
  const levelValue=document.getElementById('lead_level')?.value||'';
  return {
    displayName,
    phone,
    wechatName,
    level:levelValue==='自定义'?document.getElementById('lead_level_custom')?.value?.trim?.()||'':levelValue,
    leadDate:document.getElementById('lead_leadDate')?.value||today(),
    source:FlowTennisBusinessTaxonomy.normalizeLeadSource(document.getElementById('lead_source')?.value||''),
    campus:document.getElementById('lead_campus')?.value||'',
    customerType:FlowTennisBusinessTaxonomy.normalizeLeadCustomerType(document.getElementById('lead_customerType')?.value||''),
    demandProduct:FlowTennisBusinessTaxonomy.normalizeLeadDemandProduct(document.getElementById('lead_demandProduct')?.value||''),
    consultType:FlowTennisBusinessTaxonomy.normalizeLeadDemandProduct(document.getElementById('lead_demandProduct')?.value||''),
    intentLevel:document.getElementById('lead_intentLevel')?.value||'',
    followupPriority:document.getElementById('lead_followupPriority')?.value||'',
    owner:leadNormalizeOwnerName(document.getElementById('lead_owner')?.value||''),
    profileNote:document.getElementById('lead_profileNote')?.value?.trim?.()||''
  };
}
function startLeadBasicDrawerEdit(leadId){
  leadDetailActiveTab='basic';
  leadDetailEditingSection='basic';
  leadDetailEditingFollowupId='';
  leadDetailConversionMode='';
  openLeadDetail(leadId);
}
function cancelLeadDrawerEdit(leadId){
  leadDetailEditingSection='';
  leadDetailEditingFollowupId='';
  leadDetailConversionMode='';
  openLeadDetail(leadId);
}
async function saveLeadBasicFromDrawer(leadId){
  await runStandardMutation('leadDrawerSaveBtn',async()=>{
    const res=await apiCall('PUT','/leads/'+leadId,leadPayloadFromForm());
    const lead=res?.lead||res;
    if(lead?.id)upsertLeadLocal(lead);
    return res;
  },{
    successText:'线索已更新 ✓',
    onSuccess:()=>{
      renderLeads();
      leadDetailEditingSection='';
      openLeadDetail(leadId);
      refreshLeadRuntimeInBackground({},()=>{
        renderLeads();
        reopenLeadDetailIfStillOpen(leadId);
      });
    }
  });
}
function openLeadDeleteConfirm(leadId){
  const lead=leadById(leadId);
  if(!lead){toast('线索不存在，请刷新后重试','warn');return;}
  confirmDel(lead.id,leadDisplayName(lead),'lead');
}
function leadDetailBasicTabHtml(lead){
  const editing=leadDetailEditingSection==='basic';
  if(editing){
    const actions=`<div class="schedule-detail-card-actions"><button type="button" class="schedule-detail-action muted" onclick="cancelLeadDrawerEdit('${lead.id}')">取消</button><button type="button" class="schedule-detail-action primary" id="leadDrawerSaveBtn" onclick="saveLeadBasicFromDrawer('${lead.id}')">保存</button></div>`;
    return renderDetailDrawerContent(renderDetailDrawerFormCard('基础信息',leadBasicInfoFormHtml(lead),actions));
  }
  const actions=`<button type="button" class="schedule-detail-action" onclick="openLeadMergeModal('${lead.id}')">合并重复线索</button><button type="button" class="schedule-detail-action" onclick="startLeadBasicDrawerEdit('${lead.id}')">编辑</button><button type="button" class="schedule-detail-action muted" onclick="openLeadDeleteConfirm('${lead.id}')">删除线索</button>`;
  return renderDetailDrawerContent(leadDrawerCardHtml('基础信息',leadBasicInfoReadonlyHtml(lead),'lead-basic-card',actions));
}
function leadFollowupTimelineItemHtml(lead,item){
  const date=leadFollowupDateText(item);
  const by=leadFollowupPersonText(item);
  const status=leadFollowupConvertedText(item);
  const note=leadFollowupNoteText(item);
  return {className:'lead-followup-item',contentHtml:`<div class="student-lesson-row"><div class="student-lesson-main"><div class="student-lesson-title">${esc(`${date} · ${by} 跟进 · ${status}`)}</div><div class="student-lesson-meta">${esc(note)}</div></div><button class="schedule-detail-action" onclick="startLeadFollowupDrawerEdit('${lead.id}','${item.id}')">编辑</button></div>`};
}
function leadFollowupDrawerFormHtml(lead,followup=null){
  const followupTypeOptions=leadFollowupTypeOptions();
  const statusOptions=leadStatusAfterOptions();
  const dealTypeValue=leadNormalizeDealType(followup?.dealType||followup?.conversionType||leadDealTypeText(lead));
  return `<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">跟进时间</label>${courtDateButtonHtml('lead_followupAt',followup?leadFollowupDateInputValue(followup.followupAt||followup.createdAt,lead):today(),'跟进时间')}</div><div class="tms-form-item"><label class="tms-form-label">跟进人</label>${renderStandardDropdownHtml('lead_followupBy','跟进人',[{value:'',label:'-'},...leadOwnerOptions()],leadNormalizeOwnerName(followup?.followupBy)||currentUser?.name||leadNormalizeOwnerName(lead?.owner)||'',true)}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">跟进方式</label>${renderStandardDropdownHtml('lead_followupType','跟进方式',followupTypeOptions,followup?.followupType||'电话',true)}</div><div class="tms-form-item"><label class="tms-form-label">当前状态</label>${renderStandardDropdownHtml('lead_statusAfter','当前状态',statusOptions,followup?.statusAfter||leadSystemStatusText(lead),true,'toggleLeadDealTypeField')}</div><div class="tms-form-item" id="lead_dealType_host" style="${(followup?.statusAfter||leadSystemStatusText(lead))==='已成交'?'':'display:none'}"><label class="tms-form-label">成交类型</label>${renderStandardDropdownHtml('lead_dealType','成交类型',leadDealTypeOptions(),dealTypeValue,true)}</div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">沟通内容</label><textarea class="finput tms-form-control" id="lead_communicationNote">${esc(followup?.communicationNote||'')}</textarea></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">用户顾虑</label><textarea class="finput tms-form-control" id="lead_concern">${esc(followup?.concern||'')}</textarea></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">本次结论</label><textarea class="finput tms-form-control" id="lead_conclusion">${esc(followup?.conclusion||'')}</textarea></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item"><label class="tms-form-label">下次跟进时间</label>${courtDateButtonHtml('lead_nextFollowupAt',followup?.nextFollowupAt||lead?.nextFollowupAt||'','下次跟进时间')}</div><div class="tms-form-item"><label class="tms-form-label">下次动作</label><input class="finput tms-form-control" id="lead_nextAction" value="${esc(followup?.nextAction||lead?.nextAction||'')}"></div></div>`;
}
function toggleLeadDealTypeField(){
  const host=document.getElementById('lead_dealType_host');
  if(host)host.style.display=(document.getElementById('lead_statusAfter')?.value==='已成交')?'':'none';
}
function startLeadFollowupDrawerEdit(leadId,followupId=''){
  leadDetailActiveTab='followups';
  leadDetailEditingSection='followup';
  leadDetailEditingFollowupId=followupId||'';
  leadDetailConversionMode='';
  openLeadDetail(leadId);
}
function leadFollowupPayloadFromForm(){
  const statusAfter=document.getElementById('lead_statusAfter')?.value||'跟进中';
  const dealType=leadNormalizeDealType(document.getElementById('lead_dealType')?.value||'');
  if(statusAfter==='已成交'&&!dealType)throw new Error('已成交必须选择成交类型');
  return {
    followupAt:document.getElementById('lead_followupAt')?.value||today(),
    followupBy:leadNormalizeOwnerName(document.getElementById('lead_followupBy')?.value||'')||currentUser?.name||'',
    followupType:document.getElementById('lead_followupType')?.value||'其他',
    communicationNote:document.getElementById('lead_communicationNote')?.value?.trim?.()||'',
    concern:document.getElementById('lead_concern')?.value?.trim?.()||'',
    conclusion:document.getElementById('lead_conclusion')?.value?.trim?.()||'',
    statusAfter,
    dealType,
    conversionType:dealType,
    nextFollowupAt:document.getElementById('lead_nextFollowupAt')?.value||'',
    nextAction:document.getElementById('lead_nextAction')?.value?.trim?.()||''
  };
}
async function saveLeadFollowupFromDrawer(leadId,followupId=''){
  await runStandardMutation('leadFollowupDrawerSaveBtn',async()=>{
    const res=followupId
      ? await apiCall('PUT',`/lead-followups/${followupId}`,leadFollowupPayloadFromForm())
      : await apiCall('POST',`/leads/${leadId}/followups`,leadFollowupPayloadFromForm());
    if(res?.followup)upsertLeadFollowupLocal(res.followup);
    if(res?.lead)upsertLeadLocal(res.lead);
    return res;
  },{
    successText:'跟进已保存 ✓',
    onSuccess:()=>{
      renderLeads();
      leadDetailEditingSection='';
      leadDetailEditingFollowupId='';
      openLeadDetail(leadId);
      if(typeof ensureLeadFollowupsForLead==='function'){
        ensureLeadFollowupsForLead(leadId,{force:true}).then(()=>reopenLeadDetailIfStillOpen(leadId,'followups')).catch(e=>console.warn('lead followups background refresh skipped',e));
      }
      refreshLeadRuntimeInBackground({},renderLeads);
    }
  });
}
function leadDetailFollowupsTabHtml(lead){
  const editing=leadDetailEditingSection==='followup';
  const followup=(Array.isArray(leadFollowups)?leadFollowups:[]).find(item=>String(item?.id||'')===String(leadDetailEditingFollowupId))||null;
  if(editing){
    const actions=`<div class="schedule-detail-card-actions"><button type="button" class="schedule-detail-action muted" onclick="cancelLeadDrawerEdit('${lead.id}')">取消</button><button type="button" class="schedule-detail-action primary" id="leadFollowupDrawerSaveBtn" onclick="saveLeadFollowupFromDrawer('${lead.id}','${leadDetailEditingFollowupId||''}')">保存跟进</button></div>`;
    return renderDetailDrawerContent(renderDetailDrawerFormCard(followup?'编辑跟进':'新增跟进',leadFollowupDrawerFormHtml(lead,followup),actions));
  }
  const actions=`<button type="button" class="schedule-detail-action" onclick="startLeadFollowupDrawerEdit('${lead.id}')">新增跟进</button>`;
  return renderDetailDrawerContent(leadDrawerCardHtml('跟进记录',leadTimelineHtml(lead),'lead-followup-card',actions,{useGrid:false}));
}
function leadConversionSummaryHtml(lead){
  return [
    leadDetailFieldHtml('线索阶段',leadStageText(lead)),
    leadDetailFieldHtml('成交类型',leadDealTypeText(lead)||'-'),
    leadCompanionScheduleActionHtml(lead),
    leadLinkedAccountFieldHtml(lead,'student'),
    leadPurchasePackageActionHtml(lead),
    leadCourtConversionActionHtml(lead),
    leadLinkedAccountFieldHtml(lead,'court'),
    leadMembershipConversionActionHtml(lead),
    leadDetailFieldHtml('成交教练',leadFormalCoachText(lead)),
    leadDetailFieldHtml('成交时间',leadFormalSignupDateText(lead)),
    leadDetailBlockHtml('流失原因',esc(lead?.lostReason||'-'),{hideEmpty:false})
  ].join('');
}
function leadHasCompanionDeal(lead){
  return /陪打/.test(leadDealTypeText(lead));
}
function leadCompanionScheduleActionHtml(lead){
  if(!leadHasCompanionDeal(lead))return '';
  return `<div class="schedule-detail-field"><div class="schedule-detail-label">陪打排课</div><div class="schedule-detail-value lead-linked-account-value"><span>${esc(leadDisplayName(lead))}</span><span class="lead-inline-actions">${leadInlineActionHtml('创建陪打排课',`openLeadCompanionSchedule('${lead.id}')`)}</span></div></div>`;
}
function leadCourtConversionActionHtml(lead){
  if(!/订场/.test(leadDealTypeText(lead))||lead?.courtId)return '';
  return `<div class="schedule-detail-field"><div class="schedule-detail-label">订场用户档案</div><div class="schedule-detail-value lead-linked-account-value"><span>已成交订场但未创建订场用户档案</span><span class="lead-inline-actions">${leadInlineActionHtml('创建订场用户档案',`convertLeadToCourt('${lead.id}')`,'','leadConvertCourtBtn')}</span></div></div>`;
}
function leadMembershipConversionActionHtml(lead){
  if(!/订场会员/.test(leadDealTypeText(lead))||lead?.membershipAccountId)return '';
  const text=lead?.courtId?'已成交订场会员但未开通会员账户':'需先创建或关联订场用户，再开通会员账户';
  return `<div class="schedule-detail-field"><div class="schedule-detail-label">会员账户</div><div class="schedule-detail-value lead-linked-account-value"><span>${esc(text)}</span><span class="lead-inline-actions">${leadInlineActionHtml('去会员管理开卡/储值',`openLeadMembershipNextStep('${lead.id}')`)}</span></div></div>`;
}
function leadCompanionScheduleSeed(lead){
  return {
    courseType:'陪打',
    standardCourseType:'陪打',
    scheduleSource:'线索陪打',
    sourceLeadId:lead?.id||'',
    sourceLeadName:leadDisplayName(lead),
    studentName:leadDisplayName(lead),
    studentIds:lead?.studentId?[lead.studentId]:[],
    expectedStudentIds:lead?.studentId?[lead.studentId]:[],
    settlementType:'gift',
    lessonCount:1,
    campus:lead?.campus||lead?.campusName||''
  };
}
function openLeadCompanionSchedule(leadId){
  const lead=leadById(leadId);
  if(!lead)return;
  if(typeof openScheduleModal!=='function'){toast('排课模块尚未加载','warn');return;}
  openScheduleModal('',leadCompanionScheduleSeed(lead));
}
function leadInlineActionHtml(text,onclick,tone='',id=''){
  return `<span class="lead-inline-link-action ${tone}" ${id?`id="${esc(id)}"`:''} onclick="${onclick}">${esc(text)}</span>`;
}
function leadLinkedAccountFieldHtml(lead,type){
  const isStudent=type==='student';
  const linked=isStudent?!!lead?.studentId:!!lead?.courtId;
  const label=isStudent?'关联学员':'关联订场用户';
  const value=linked?(isStudent?linkedStudentName(lead):linkedCourtName(lead)):'';
  const linkAction=leadInlineActionHtml(linked?'修改':'关联',isStudent?`openLeadLinkStudentModal('${lead.id}')`:`openLeadLinkCourtModal('${lead.id}')`);
  const deleteAction=linked?leadInlineActionHtml('删除',isStudent?`unlinkLeadStudent('${lead.id}')`:`unlinkLeadCourt('${lead.id}')`,'danger',isStudent?'leadUnlinkStudentBtn':'leadUnlinkCourtBtn'):'';
  const valueHtml=linked?`<span>${esc(value)}</span>`:'';
  return `<div class="schedule-detail-field"><div class="schedule-detail-label">${esc(label)}</div><div class="schedule-detail-value lead-linked-account-value">${valueHtml}<span class="lead-inline-actions">${linkAction}${deleteAction}</span></div></div>`;
}
function leadPackageRowIsFormal(row){
  const text=[row?.courseType,row?.standardCourseType,row?.packageCourseType,row?.type,row?.courseTypeLevel2,row?.packageName,row?.productName,row?.name].filter(Boolean).join(' ');
  return !/体验|trial|experience/i.test(text);
}
function leadPackageRowActive(row){
  const status=String(row?.status||row?.systemStatus||'').trim();
  return !['voided','cancelled','canceled','deleted','inactive','已作废','作废'].includes(status);
}
function leadFormalPackageRows(lead){
  const studentId=String(lead?.studentId||'').trim();
  if(!studentId)return [];
  const entitlementRows=(Array.isArray(entitlements)?entitlements:[])
    .filter(row=>String(row?.studentId||'')===studentId&&leadPackageRowActive(row)&&leadPackageRowIsFormal(row));
  const entitlementPurchaseIds=new Set(entitlementRows.map(row=>String(row?.purchaseId||'')).filter(Boolean));
  const purchaseRows=(Array.isArray(purchases)?purchases:[])
    .filter(row=>String(row?.studentId||'')===studentId&&leadPackageRowActive(row)&&leadPackageRowIsFormal(row)&&!entitlementPurchaseIds.has(String(row?.id||'')));
  return [...entitlementRows,...purchaseRows].sort((a,b)=>String(b?.purchaseDate||b?.createdAt||'').localeCompare(String(a?.purchaseDate||a?.createdAt||'')));
}
function leadHasFormalPackage(lead){
  return leadFormalPackageRows(lead).length>0;
}
function leadFormalPackageText(lead){
  const rows=leadFormalPackageRows(lead);
  return rows.slice(0,2).map(row=>{
    const name=String(row?.packageName||row?.productName||row?.name||row?.courseType||'正式课包').trim();
    const total=Number(row?.totalLessons||row?.packageLessons)||0;
    const remaining=Number(row?.remainingLessons);
    const balance=total>0&&Number.isFinite(remaining)?` ${lessonQty(remaining)}/${lessonQty(total)}`:total>0?` ${lessonQty(total)}节`:'';
    return `${name}${balance}`;
  }).join('；')||'已购课包';
}
function leadFormalPackageCoach(lead){
  const row=leadFormalPackageRows(lead).find(item=>String(item?.ownerCoach||item?.coach||item?.coachName||'').trim())||{};
  return String(row.ownerCoach||row.coach||row.coachName||'').trim();
}
function leadFormalCoachText(lead){
  return linkedCoachName(leadStandardField(lead,'formalCoach')||leadFormalPackageCoach(lead));
}
function leadPurchasePackageActionHtml(lead){
  if(!lead?.studentId){
    if(leadStageText(lead)==='已成交'&&/课程/.test(leadDealTypeText(lead))){
      return `<div class="schedule-detail-field"><div class="schedule-detail-label">学员档案</div><div class="schedule-detail-value lead-linked-account-value"><span>已成交课程但未创建学员档案</span><span class="lead-inline-actions">${leadInlineActionHtml('创建学员档案并购买课包',`convertLeadToStudentAndPurchase('${lead.id}')`,'','leadConvertStudentPurchaseBtn')}</span></div></div>`;
    }
    if(leadStageText(lead)==='已约体验'||leadStageText(lead)==='已体验待成交'){
      return `<div class="schedule-detail-field"><div class="schedule-detail-label">体验学员档案</div><div class="schedule-detail-value lead-linked-account-value"><span>需要先创建学员档案才能买体验课包和排课</span><span class="lead-inline-actions">${leadInlineActionHtml('创建体验学员档案并购买体验课包',`convertLeadToStudentAndPurchase('${lead.id}')`,'','leadConvertStudentPurchaseBtn')}</span></div></div>`;
    }
    return '';
  }
  if(leadHasFormalPackage(lead)){
    return `<div class="schedule-detail-field"><div class="schedule-detail-label">课包信息</div><div class="schedule-detail-value lead-linked-account-value"><span>已购课包：${esc(leadFormalPackageText(lead))}</span></div></div>`;
  }
  return `<div class="schedule-detail-field"><div class="schedule-detail-label">课包状态</div><div class="schedule-detail-value lead-linked-account-value"><span>已关联学员但未买课包</span><span class="lead-inline-actions">${leadInlineActionHtml('去购买课包',`openLeadPurchasePackage('${lead.id}')`)}${leadInlineActionHtml('直接排课',`openLeadStudentSchedule('${lead.id}')`)}</span></div></div>`;
}
function leadStudentScheduleSeed(lead){
  return {
    courseType:'私教课',
    standardCourseType:'私教课',
    scheduleSource:'线索课程',
    sourceLeadId:lead?.id||'',
    sourceLeadName:leadDisplayName(lead),
    studentName:leadDisplayName(lead),
    studentIds:lead?.studentId?[lead.studentId]:[],
    expectedStudentIds:lead?.studentId?[lead.studentId]:[],
    settlementType:'single',
    lessonCount:1,
    campus:lead?.campus||lead?.campusName||''
  };
}
function openLeadStudentSchedule(leadId){
  const lead=leadById(leadId);
  if(!lead?.studentId){toast('请先关联学员','warn');return;}
  if(typeof openScheduleModal!=='function'){toast('排课模块尚未加载','warn');return;}
  openScheduleModal('',leadStudentScheduleSeed(lead));
}
async function openLeadPurchasePackage(leadId){
  const lead=leads.find(item=>String(item?.id||'')===String(leadId));
  if(!lead?.studentId){toast('请先关联学员','warn');return;}
  openPurchaseModal(lead.studentId);
}
function startLeadConversionDrawerMode(leadId,mode){
  leadDetailActiveTab='conversion';
  leadDetailEditingSection='';
  leadDetailEditingFollowupId='';
  leadDetailConversionMode=mode||'';
  openLeadDetail(leadId);
}
function leadLinkSearchRows(mode,keyword=''){
  const isStudent=mode==='link-student';
  const rows=isStudent?students:courts;
  const q=String(keyword||'').trim().toLowerCase();
  return rows.filter(row=>{
    if(!q)return true;
    return [row?.name,row?.displayName,row?.wechatName,row?.phone,cn(row?.campus||row?.campusName)].some(value=>String(value||'').toLowerCase().includes(q));
  }).sort((a,b)=>String(a?.name||a?.displayName||'').localeCompare(String(b?.name||b?.displayName||''),'zh-CN')).slice(0,80);
}
function leadLinkRecordLabel(row={}){
  const name=String(row.name||row.displayName||row.wechatName||'未命名').trim();
  const phone=String(row.phone||'').trim();
  const campusName=cn(row.campus||row.campusName);
  return [name,phone,campusName].filter(Boolean).join(' · ');
}
function leadLinkPickerHtml(lead,mode,selectedId='',keyword=''){
  const rows=leadLinkSearchRows(mode,keyword);
  if(!rows.length)return '<div style="font-size:12px;color:var(--td);padding:10px 0">没有匹配结果，请换个关键词。</div>';
  return `<div class="tms-checkbox-matrix lead-link-picker">${rows.map(row=>`<label class="tms-checkbox-wrap ${String(row.id||'')===String(selectedId||'')?'active':''}" onclick="selectLeadLinkedRecord('${mode}','${row.id}')"><input type="radio" class="tms-checkbox" name="leadLinkPick" ${String(row.id||'')===String(selectedId||'')?'checked':''}><span>${esc(leadLinkRecordLabel(row))}</span></label>`).join('')}</div>`;
}
function renderLeadLinkPicker(mode){
  const isStudent=mode==='link-student';
  const id=isStudent?'lead_link_student_id':'lead_link_court_id';
  const host=document.getElementById('lead_link_picker_wrap');
  if(!host)return;
  const lead=leadById(document.getElementById('overlay')?.dataset.leadDetailId)||{};
  host.innerHTML=leadLinkPickerHtml(lead,mode,document.getElementById(id)?.value||'',document.getElementById('lead_link_search')?.value||'');
}
function selectLeadLinkedRecord(mode,recordId){
  const isStudent=mode==='link-student';
  const id=isStudent?'lead_link_student_id':'lead_link_court_id';
  const input=document.getElementById(id);
  if(input)input.value=recordId||'';
  const row=(isStudent?students:courts).find(item=>String(item?.id||'')===String(recordId||''));
  const search=document.getElementById('lead_link_search');
  if(search&&row)search.value=leadLinkRecordLabel(row);
  renderLeadLinkPicker(mode);
}
function leadConversionLinkFormHtml(lead,mode,{modal=false}={}){
  const isStudent=mode==='link-student';
  const id=isStudent?'lead_link_student_id':'lead_link_court_id';
  const selectedId=isStudent?(lead.studentId||''):(lead.courtId||'');
  const selectedRow=(isStudent?students:courts).find(row=>String(row?.id||'')===String(selectedId));
  const searchValue=selectedRow?leadLinkRecordLabel(selectedRow):'';
  const save=isStudent?`saveLeadLinkStudent('${lead.id}')`:`saveLeadLinkCourt('${lead.id}')`;
  const btnId=isStudent?'leadLinkStudentBtn':'leadLinkCourtBtn';
  const cancel=modal?'closeModal()':`startLeadConversionDrawerMode('${lead.id}','')`;
  return `<div class="schedule-detail-form"><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">${isStudent?'选择学员':'选择订场用户'}</label><input type="hidden" id="${id}" value="${esc(selectedId)}"><input class="finput tms-form-control" id="lead_link_search" value="${esc(searchValue)}" placeholder="搜索姓名 / 手机号 / 校区" oninput="renderLeadLinkPicker('${mode}')"><div id="lead_link_picker_wrap" style="margin-top:8px">${leadLinkPickerHtml(lead,mode,selectedId,searchValue)}</div></div></div><div class="schedule-detail-card-actions lead-conversion-form-actions"><button type="button" class="schedule-detail-action muted" onclick="${cancel}">取消</button><button type="button" class="schedule-detail-action primary" id="${btnId}" onclick="${save}">确认关联</button></div></div>`;
}
function leadDetailConversionTabHtml(lead){
  const form=leadDetailConversionMode==='link-student'
    ? leadDrawerCardHtml('关联学员',leadConversionLinkFormHtml(lead,'link-student'),'lead-conversion-card','',{useGrid:false})
    : leadDetailConversionMode==='link-court'
      ? leadDrawerCardHtml('关联订场用户',leadConversionLinkFormHtml(lead,'link-court'),'lead-conversion-card','',{useGrid:false})
      : '';
  return renderDetailDrawerContent(`${leadDrawerCardHtml('成交状态',leadConversionSummaryHtml(lead),'lead-conversion-card')}${form}`);
}
function leadDetailIsEmptyHtml(html){
  const text=String(html||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').trim();
  return !text||['-','暂无跟进时间线','暂无线索详情'].includes(text);
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
  if(leadFollowupDetailNeedsLoad(leadId)&&loadLeadFollowupDetailThenOpen(leadId))return;
  refreshLeadDetailFromServer(leadId);
  const body=leadDetailActiveTab==='basic'?leadDetailBasicTabHtml(lead):leadDetailActiveTab==='followups'?leadDetailFollowupsTabHtml(lead):leadDetailConversionTabHtml(lead);
  openStandardDetailDrawer({
    titleHtml:`${leadDetailHeroHtml(lead)}${leadDetailTabsHtml(leadDetailActiveTab)}`,
    bodyHtml:body,
    actionsHtml:'',
    data:{leadDetailId:lead.id},
    overlayClasses:['schedule-drawer-overlay'],
    modalClass:'modal modal-court modal-schedule-drawer modal-lead-drawer'
  });
  ensureLeadConversionLookups(leadId);
}
function openLeadDetailFromList(leadId){
  leadDetailActiveTab='basic';
  leadDetailEditingSection='';
  leadDetailEditingFollowupId='';
  leadDetailConversionMode='';
  openLeadDetail(leadId);
}
function openLeadFollowupFromList(leadId){
  startLeadFollowupDrawerEdit(leadId,'');
}
function openLeadCreateDrawer(){
  leadDetailActiveTab='basic';
  leadDetailEditingSection='create';
  leadDetailEditingFollowupId='';
  leadDetailConversionMode='';
  const lead={id:'',displayName:'',wechatName:'',leadDate:today()};
  const actions=`<div class="schedule-detail-card-actions"><button type="button" class="schedule-detail-action muted" onclick="closeModal()">取消</button><button type="button" class="schedule-detail-action primary" id="leadSaveBtn" onclick="saveLead('')">保存</button></div>`;
  const body=renderDetailDrawerContent(renderDetailDrawerFormCard('基础信息',leadBasicInfoFormHtml(lead),actions));
  openStandardDetailDrawer({
    titleHtml:`${leadDetailHeroHtml({...lead,displayName:'新增线索'},{createMode:true})}${leadDetailTabsHtml('basic',{createMode:true})}`,
    bodyHtml:body,
    actionsHtml:'',
    data:{leadDetailId:''},
    overlayClasses:['schedule-drawer-overlay'],
    modalClass:'modal modal-court modal-schedule-drawer modal-lead-drawer'
  });
}
function openLeadModal(leadId){
  if(!leadId)return openLeadCreateDrawer();
  leadDetailActiveTab='basic';
  leadDetailEditingSection='basic';
  leadDetailEditingFollowupId='';
  leadDetailConversionMode='';
  openLeadDetail(leadId);
}
async function refreshLeadRuntime({withStudents=false,withCourts=false,waitForMetrics=true}={}){
  const base=['leads'];
  if(waitForMetrics)base.push('lifecycleMetricsPage');
  else if(typeof markReadModelsStale==='function')markReadModelsStale(['lifecycleMetricsPage']);
  if(withStudents)base.push('students');
  try{
    await ensureDatasetsByName(base,{force:true});
  }catch(e){
    console.warn('lead runtime refresh skipped',e);
  }
  if(withCourts){
    try{
      await ensureDatasetsByName(['courts'],{force:true});
    }catch(e){
      console.warn('lead runtime refresh skipped courts',e);
    }
  }
}
function refreshLeadRuntimeInBackground(options={},after=null){
  refreshLeadRuntime({...options,waitForMetrics:true}).then(()=>{
    if(typeof after==='function')after();
  }).catch(e=>console.warn('lead runtime background refresh skipped',e));
}
function reopenLeadDetailIfStillOpen(leadId,tab=''){
  const currentId=document.getElementById('overlay')?.dataset.leadDetailId||'';
  if(currentId===String(leadId)&&(!tab||leadDetailActiveTab===tab))openLeadDetail(leadId);
}
async function saveLead(leadId=''){
  const wechatName=document.getElementById('lead_wechatName')?.value?.trim?.()||'';
  const phone=document.getElementById('lead_phone')?.value?.trim?.()||'';
  if(!wechatName){toast('请填写姓名','warn');return;}
  if(!leadPhoneValid(phone)){toast('手机号格式不正确','warn');return;}
  const payload=leadPayloadFromForm();
  await runStandardMutation('leadSaveBtn',async()=>{
    const res=leadId?await apiCall('PUT','/leads/'+leadId,payload):await apiCall('POST','/leads',{...payload,createInitialFollowup:true});
    if(res?.lead)upsertLeadLocal(res.lead);
    if(res?.followup)upsertLeadFollowupLocal(res.followup);
    return res;
  },{
    successText:leadId?'线索已更新 ✓':'线索已创建 ✓',
    closeOnSuccess:true,
    onSuccess:()=>{
      renderLeads();
      refreshLeadRuntimeInBackground({},renderLeads);
    }
  });
}
async function unlinkLeadStudent(leadId){
  if(!await appConfirm('确认解除关联学员？学员档案不会删除。',{title:'解除关联',confirmText:'解除关联'}))return;
  await runStandardMutation('leadUnlinkStudentBtn',async()=>{
    const res=await apiCall('POST',`/leads/${leadId}/unlink-student`,{});
    if(res?.lead)upsertLeadLocal(res.lead);
    if(res?.student)upsertLeadStudentLocal(res.student);
    return res;
  },{
    loadingText:'解除中…',
    errorPrefix:'解除失败',
    successText:'关联学员已解除 ✓',
    onSuccess:()=>{
      renderLeads();
      openLeadDetail(leadId);
      refreshLeadRuntimeInBackground({withStudents:true},()=>{
        renderLeads();
        reopenLeadDetailIfStillOpen(leadId);
      });
    }
  });
}
async function unlinkLeadCourt(leadId){
  if(!await appConfirm('确认解除关联订场用户？订场用户不会删除。',{title:'解除关联',confirmText:'解除关联'}))return;
  await runStandardMutation('leadUnlinkCourtBtn',async()=>{
    const res=await apiCall('POST',`/leads/${leadId}/unlink-court`,{});
    if(res?.lead)upsertLeadLocal(res.lead);
    if(res?.court)upsertLeadCourtLocal(res.court);
    return res;
  },{
    loadingText:'解除中…',
    errorPrefix:'解除失败',
    successText:'关联订场用户已解除 ✓',
    onSuccess:()=>{
      renderLeads();
      openLeadDetail(leadId);
      refreshLeadRuntimeInBackground({withCourts:true},()=>{
        renderLeads();
        reopenLeadDetailIfStillOpen(leadId);
      });
    }
  });
}
function openLeadFollowupModal(leadId,followupId=''){
  const lead=leadById(leadId)||null;
  const followup=(Array.isArray(leadFollowups)?leadFollowups:[]).find(item=>String(item?.id||'')===String(followupId))||null;
  const followupTypeOptions=leadFollowupTypeOptions();
  const statusOptions=leadStatusAfterOptions();
  const dealTypeValue=leadNormalizeDealType(followup?.dealType||followup?.conversionType||leadDealTypeText(lead));
  const body=`<div class="tms-section-header" style="margin-top:0;">${followup?'编辑跟进':'新增跟进'}</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">跟进时间</label>${courtDateButtonHtml('lead_followupAt',followup?leadFollowupDateInputValue(followup.followupAt||followup.createdAt,lead):today(),'跟进时间')}</div><div class="tms-form-item"><label class="tms-form-label">跟进人</label>${renderStandardDropdownHtml('lead_followupBy','跟进人',[{value:'',label:'-'},...leadOwnerOptions()],leadNormalizeOwnerName(followup?.followupBy)||currentUser?.name||leadNormalizeOwnerName(lead?.owner)||'',true)}</div><div class="tms-form-item"><label class="tms-form-label">跟进方式</label>${renderStandardDropdownHtml('lead_followupType','跟进方式',followupTypeOptions,followup?.followupType||'电话',true)}</div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">沟通内容</label><textarea class="finput tms-form-control" id="lead_communicationNote">${esc(followup?.communicationNote||'')}</textarea></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">用户顾虑</label><textarea class="finput tms-form-control" id="lead_concern">${esc(followup?.concern||'')}</textarea></div><div class="tms-form-item"><label class="tms-form-label">本次结论</label><textarea class="finput tms-form-control" id="lead_conclusion">${esc(followup?.conclusion||'')}</textarea></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">当前状态</label>${renderStandardDropdownHtml('lead_statusAfter','当前状态',statusOptions,followup?.statusAfter||leadSystemStatusText(lead),true,'toggleLeadDealTypeField')}</div><div class="tms-form-item" id="lead_dealType_host" style="${(followup?.statusAfter||leadSystemStatusText(lead))==='已成交'?'':'display:none'}"><label class="tms-form-label">成交类型</label>${renderStandardDropdownHtml('lead_dealType','成交类型',leadDealTypeOptions(),dealTypeValue,true)}</div><div class="tms-form-item"><label class="tms-form-label">下次跟进时间</label>${courtDateButtonHtml('lead_nextFollowupAt',followup?.nextFollowupAt||lead?.nextFollowupAt||'','下次跟进时间')}</div><div class="tms-form-item"><label class="tms-form-label">下次动作</label><input class="finput tms-form-control" id="lead_nextAction" value="${esc(followup?.nextAction||lead?.nextAction||'')}"></div></div>`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" id="leadFollowupSaveBtn" onclick="saveLeadFollowup('${leadId}','${followupId||''}')">保存跟进</button>`;
  openStandardModal({title:followup?'编辑跟进':'新增跟进',bodyHtml:body,actionsHtml:actions,extraClass:'modal-wide'});
}
async function saveLeadFollowup(leadId,followupId=''){
  const payload=leadFollowupPayloadFromForm();
  await runStandardMutation('leadFollowupSaveBtn',async()=>{
    const res=followupId
      ? await apiCall('PUT',`/lead-followups/${followupId}`,payload)
      : await apiCall('POST',`/leads/${leadId}/followups`,payload);
    if(res?.followup)upsertLeadFollowupLocal(res.followup);
    if(res?.lead)upsertLeadLocal(res.lead);
    return res;
  },{
    successText:'跟进已保存 ✓',
    onSuccess:()=>{
      closeModal();
      renderLeads();
      openLeadDetail(leadId);
      if(typeof ensureLeadFollowupsForLead==='function'){
        ensureLeadFollowupsForLead(leadId,{force:true}).then(()=>reopenLeadDetailIfStillOpen(leadId,'followups')).catch(e=>console.warn('lead followups background refresh skipped',e));
      }
      refreshLeadRuntimeInBackground({},renderLeads);
    }
  });
}
function leadMergePayload(){
  return {
    primaryLeadId:leadMergeState.primaryLeadId,
    mergeLeadIds:leadMergeState.selectedDuplicateId?[leadMergeState.selectedDuplicateId]:[]
  };
}
function leadMergeCandidateLabel(lead){
  return [leadDisplayName(lead),lead?.phone,leadSourceText(lead),leadStageDisplayText(lead),leadDateDisplayText(lead)].filter(value=>String(value||'').trim()&&String(value).trim()!=='-').join(' / ');
}
function leadMergeCandidateHtml(lead){
  const name=leadDisplayName(lead);
  const meta=[leadSourceText(lead),leadStageDisplayText(lead),leadDateDisplayText(lead)].filter(value=>String(value||'').trim()&&String(value).trim()!=='-').join(' / ')||'-';
  return `<span class="lead-merge-candidate-main">${esc(name)}</span><span class="lead-merge-candidate-meta">${esc(meta)}</span>`;
}
function leadMergeCandidateRows(){
  const primary=leadById(leadMergeState.primaryLeadId)||{};
  const query=String(leadMergeState.search||'').trim().toLowerCase();
  const primaryPhone=leadDedupPhone(primary);
  const primaryName=leadIdentityName(leadDisplayName(primary));
  return leadRows().filter(lead=>{
    if(String(lead?.id||'')===String(leadMergeState.primaryLeadId))return false;
    if(!query)return primaryPhone&&leadDedupPhone(lead)===primaryPhone||primaryName&&leadIdentityName(leadDisplayName(lead))===primaryName;
    return [leadDisplayName(lead),lead?.phone,leadSourceText(lead),leadStageDisplayText(lead),leadDateDisplayText(lead)].some(value=>String(value||'').toLowerCase().includes(query));
  }).slice(0,20);
}
function leadMergeCandidatePickerHtml(){
  const rows=leadMergeCandidateRows();
  if(!rows.length)return '<div class="tms-empty-state" style="min-height:96px"><div class="tms-empty-title">没有匹配的线索</div><div class="tms-empty-desc">换姓名或手机号再试</div></div>';
  return `<div class="tms-checkbox-matrix lead-link-picker lead-merge-candidate-list">${rows.map(row=>`<label class="tms-checkbox-wrap lead-merge-candidate-option ${String(row.id||'')===String(leadMergeState.selectedDuplicateId||'')?'active':''}" onclick="selectLeadMergeDuplicate('${row.id}')"><input type="radio" class="tms-checkbox" name="leadMergePick" ${String(row.id||'')===String(leadMergeState.selectedDuplicateId||'')?'checked':''}><span class="lead-merge-candidate-text">${leadMergeCandidateHtml(row)}</span></label>`).join('')}</div>`;
}
function renderLeadMergeCandidatePicker(keepSelected=false){
  leadMergeState.search=document.getElementById('leadMergeCandidateSearch')?.value||leadMergeState.search||'';
  if(!keepSelected)leadMergeState.selectedDuplicateId='';
  leadMergeState.preview=null;
  const picker=document.getElementById('leadMergeCandidateWrap');
  if(picker)picker.innerHTML=leadMergeCandidatePickerHtml();
  const preview=document.getElementById('leadMergePreviewResult');
  if(preview)preview.innerHTML=leadMergePreviewHtml(null);
  const btn=document.getElementById('leadMergeConfirmBtn');
  if(btn)btn.disabled=false;
}
function selectLeadMergeDuplicate(id){
  leadMergeState.selectedDuplicateId=String(id||'');
  renderLeadMergeCandidatePicker(true);
}
function leadMergeFriendlyError(error){
  const raw=String(error?.message||error||'').replace(/\s*\[[^\]]+\]\s*$/,'').trim();
  if(/不同学员/.test(raw))return '这两条线索已关联不同学员，请选择要保留的学员线索作为主线索后再合并。';
  if(/不同订场用户/.test(raw))return '这两条线索已关联不同订场用户，不能直接合并。请先确认订场用户后再操作。';
  if(/请选择主线索和要合并的线索|请选择两条不同线索/.test(raw))return '请选择要合并进来的重复线索。';
  if(/主线索不存在/.test(raw))return '当前线索不存在，请刷新后重试。';
  if(/已合并/.test(raw))return '这条线索已经被合并过，请刷新线索池后重试。';
  return raw||'线索合并失败，请稍后重试。';
}
function leadMergeBlockedText(error){
  const raw=String(error?.message||error||'');
  if(/不同学员/.test(raw)){
    return {
      reason:'这两条线索已经分别关联到不同学员。',
      next:'请把要保留的学员线索作为主线索；确认合并会迁移副学员业务记录并隐藏副学员档案。'
    };
  }
  if(/不同订场用户/.test(raw)){
    return {
      reason:'这两条线索已经分别关联到不同订场用户，系统不能判断是不是同一个人。',
      next:'如果确认是同一个订场用户，请先处理订场用户档案；如果不是同一个人，请不要合并这两条线索。'
    };
  }
  return {reason:leadMergeFriendlyError(error),next:'请检查选择的两条线索后再试。'};
}
function leadMergePreviewRowHtml(label,value){
  return `<div class="lead-merge-preview-row"><span>${esc(label)}：</span><span>${esc(value)}</span></div>`;
}
function leadMergePreviewHtml(preview){
  if(!preview)return '<div class="tms-text-secondary">可先点击预览查看影响，也可以直接确认合并。</div>';
  if(preview.blocked){
    const blocked=leadMergeBlockedText(preview.error||preview.message||'');
    return `<div class="lead-merge-blocked">${leadMergePreviewRowHtml('原因',blocked.reason)}${leadMergePreviewRowHtml('下一步',blocked.next)}</div>`;
  }
  const primary=leadById(preview.primaryLeadId)||preview.primaryLead||{};
  const duplicate=leadById((preview.mergeLeadIds||[])[0])||(preview.duplicateLeads||[])[0]||{};
  const rows=[
    ['保留线索',leadDisplayName(primary)],
    ['隐藏线索',leadDisplayName(duplicate)],
    ['跟进迁移',`${preview.counts?.followupsToMove||0} 条`],
    ['学员引用',`${preview.counts?.studentSourceLinks||0} 条`],
    ['学员档案',preview.counts?.studentProfilesMerged?`合并 ${preview.counts.studentProfilesMerged} 个副档案`:'无需合并'],
    ['业务迁移',preview.counts?.studentReferenceLinks?`${preview.counts.studentReferenceLinks} 条`:'无需迁移'],
    ['订场引用',`${preview.counts?.courtSourceLinks||0} 条`],
    ['会员引用',`${preview.counts?.membershipSourceLinks||0} 条`]
  ].map(([label,value])=>leadMergePreviewRowHtml(label,value)).join('');
  const conflicts=(preview.conflicts||[]).map(item=>leadMergePreviewRowHtml(item.label,(item.values||[]).join(' / '))).join('')||leadMergePreviewRowHtml('字段冲突','无明显字段冲突');
  return `<div class="lead-merge-preview-list">${rows}</div><div class="tms-section-header">字段冲突提醒</div><div class="lead-merge-preview-list">${conflicts}</div>`;
}
function openLeadMergeModal(primaryLeadId=''){
  const rows=leadRows();
  const primary=leadById(primaryLeadId);
  if(rows.length<2){toast('至少需要两条线索才能合并','warn');return;}
  if(!primary){toast('请先打开要保留的线索详情','warn');return;}
  leadMergeState={primaryLeadId:String(primaryLeadId),selectedDuplicateId:'',search:'',preview:null};
  const body=`<div class="lead-merge-modal-body" style="font-size:13px"><div class="tms-section-header" style="margin-top:0;">合并设置</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">保留线索</label><div class="finput tms-form-control lead-merge-primary" style="height:auto;min-height:44px;font-size:13px">${leadMergeCandidateHtml(primary)}</div></div><div class="tms-form-item"><label class="tms-form-label">重复线索</label><input class="finput tms-form-control lead-merge-search" id="leadMergeCandidateSearch" placeholder="搜索姓名 / 手机号" style="font-size:12px" oninput="renderLeadMergeCandidatePicker()"><div id="leadMergeCandidateWrap" style="margin-top:8px">${leadMergeCandidatePickerHtml()}</div></div></div><div class="tms-section-header">合并预览</div><div id="leadMergePreviewResult">${leadMergePreviewHtml(null)}</div></div>`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-default" id="leadMergePreviewBtn" onclick="previewLeadMerge()">预览</button><button class="tms-btn tms-btn-primary" id="leadMergeConfirmBtn" onclick="runLeadMerge()">确认合并</button>`;
  openStandardModal({title:'合并线索',bodyHtml:body,actionsHtml:actions,extraClass:'modal-wide'});
}
async function previewLeadMerge(){
  const payload=leadMergePayload();
  if(!payload.primaryLeadId||!payload.mergeLeadIds.length||payload.primaryLeadId===payload.mergeLeadIds[0]){toast('请选择两条不同线索','warn');return;}
  const preview=await runStandardMutation('leadMergePreviewBtn',async()=>{
    try{
      return await apiCall('POST','/leads/merge-preview',payload);
    }catch(e){
      const btn=document.getElementById('leadMergeConfirmBtn');
      if(btn)btn.disabled=true;
      leadMergeState.preview=null;
      const host=document.getElementById('leadMergePreviewResult');
      if(host)host.innerHTML=leadMergePreviewHtml({blocked:true,error:e});
      throw new Error('当前不能合并，请查看预览说明。');
    }
  },{
    loadingText:'预览中...',
    errorPrefix:'预览失败'
  });
  if(preview){
    leadMergeState.preview=preview;
    const host=document.getElementById('leadMergePreviewResult');
    if(host)host.innerHTML=leadMergePreviewHtml(preview);
    const btn=document.getElementById('leadMergeConfirmBtn');
    if(btn)btn.disabled=false;
    toast('预览已生成 ✓','success');
  }
}
async function runLeadMerge(){
  const payload=leadMergePayload();
  if(!payload.primaryLeadId||!payload.mergeLeadIds.length||payload.primaryLeadId===payload.mergeLeadIds[0]){toast('请选择两条不同线索','warn');return;}
  if(!await appConfirm('确认合并？重复线索会隐藏，副学员档案会并入保留学员，相关课包、排课、购买、会员等记录会迁移到保留学员。',{title:'确认合并线索',confirmText:'确认合并'}))return;
  await runStandardMutation('leadMergeConfirmBtn',async()=>{
    try{
      const res=await apiCall('POST','/leads/merge',payload);
      if(res?.primaryLead)upsertLeadLocal(res.primaryLead);
      (res?.duplicateLeads||[]).forEach(row=>upsertLeadLocal(row));
      return res;
    }catch(e){
      throw new Error(leadMergeFriendlyError(e));
    }
  },{
    successText:'线索已合并 ✓',
    closeOnSuccess:true,
    onSuccess:()=>{
      renderLeads();
      refreshLeadRuntimeInBackground({withStudents:true,withCourts:true},renderLeads);
    }
  });
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
  if(fieldsHost)fieldsHost.innerHTML='线索时间 / 姓名/电话 / 水平 / 类型 / 需求产品 / 来源 / 意向等级 / 跟进人 / 线索阶段 / 体验课时间 / 成交时间 / 用户顾虑点 / 沟通情况和方案建议 / 成交类型 / 成交教练 / 流失原因';
  if(missingHost)missingHost.innerHTML=leadImportState.error?esc(leadImportState.error):'CSV 字段校验通过';
  if(totalHost)totalHost.textContent=summary?String(summary.totalRows||0):'0';
  if(statusHost)statusHost.innerHTML=summary?Object.entries(summary.byStatus||{}).map(([key,value])=>`${esc(key)}：${value}`).join('<br>'):'新线索 / 跟进中 / 已约体验 / 已体验待成交 / 已成交 / 已流失';
  if(matchHost)matchHost.innerHTML=summary?`已自动关联学员：${summary.autoLinkedStudents||0}<br>已自动关联订场：${summary.autoLinkedCourts||0}<br>疑似匹配：${summary.possibleMatches||0}<br>未匹配：${summary.unmatchedRows||0}`:'已自动关联 / 疑似匹配待确认 / 未匹配待处理';
  if(possibleHost)possibleHost.innerHTML=rows.filter(row=>row.studentMatchType==='possible'||row.courtMatchType==='possible').slice(0,20).map(row=>`${esc(leadDisplayName(row))} · ${esc(leadStudentMatchText(row))} · ${esc(leadCourtMatchText(row))}`).join('<br>')||'预览后显示疑似匹配明细。';
  if(unmatchedHost)unmatchedHost.innerHTML=rows.filter(row=>row.studentMatchType==='none'&&row.courtMatchType==='none').slice(0,20).map(row=>`${esc(leadDisplayName(row))} · ${esc(row.phone||'无手机号')} · ${esc(row.source||'无来源')}`).join('<br>')||'预览后显示未匹配明细。';
  if(tableHost)tableHost.innerHTML=rows.length?`<div class="tms-table-wrapper" style="max-height:260px"><table class="tms-table"><thead><tr><th style="padding-left:20px">线索</th><th>来源</th><th>类型</th><th>需求产品</th><th>线索阶段</th><th>学员匹配</th><th>订场匹配</th><th class="tms-sticky-r" style="padding-right:20px">成交类型</th></tr></thead><tbody>${rows.slice(0,20).map(row=>`<tr><td style="padding-left:20px">${esc(leadDisplayName(row))}<div class="tms-text-secondary">${esc(row.phone||'-')}</div></td><td>${renderStandardCellText(row.source)}</td><td>${renderStandardCellText(row.customerType)}</td><td>${renderStandardCellText(row.demandProduct||row.consultType)}</td><td>${renderStandardCellText(row.leadStage||row.systemStatus)}</td><td>${renderStandardCellText(leadStudentMatchText(row),false)}</td><td>${renderStandardCellText(leadCourtMatchText(row),false)}</td><td class="tms-sticky-r" style="padding-right:20px">${renderStandardCellText(leadDealTypeText(row)||'-',!leadDealTypeText(row))}</td></tr>`).join('')}</tbody></table></div>${rows.length>20?'<div class="tms-text-secondary" style="margin-top:8px">仅预览前 20 条，正式导入按全部预览结果执行。</div>':''}`:'<div class="tms-text-secondary">预览后这里显示数据明细。</div>';
  if(commitBtn)commitBtn.disabled=!summary||!summary.totalRows||!!leadImportState.error;
}
function openLeadImportPreviewModal(){
  leadImportState={fileName:'',fileSize:0,fileModified:0,csvText:'',previewRows:[],summary:null,error:''};
  const body=`<div class="tms-section-header" style="margin-top:0;">导入预览</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">CSV 文件</label><input class="finput tms-form-control" id="leadImportFile" type="file" accept=".csv,text/csv" onchange="handleLeadImportFile(this)"></div></div><div class="tms-section-header">识别到的字段</div><div class="finput tms-form-control" id="leadImportFields" style="height:auto;min-height:56px">线索时间 / 姓名 / 电话 / 水平 / 来源 / 类型 / 需求产品 / 线索阶段</div><div class="tms-section-header">缺失字段提醒</div><div class="finput tms-form-control" id="leadImportMissing" style="height:auto;min-height:56px">正式联调后这里显示缺列和异常字段。</div><div class="tms-section-header">总行数</div><div class="finput tms-form-control" id="leadImportTotal">0</div><div class="tms-section-header">状态归类统计</div><div class="finput tms-form-control" id="leadImportStatus" style="height:auto;min-height:56px">新线索 / 跟进中 / 已约体验 / 已体验待成交 / 已成交 / 已流失</div><div class="tms-section-header">自动匹配统计</div><div class="finput tms-form-control" id="leadImportMatch" style="height:auto;min-height:56px">已自动关联 / 疑似匹配待确认 / 未匹配待处理</div><div class="tms-section-header">疑似匹配列表</div><div class="finput tms-form-control" id="leadImportPossible" style="height:auto;min-height:56px">预览后显示疑似匹配明细。</div><div class="tms-section-header">未匹配列表</div><div class="finput tms-form-control" id="leadImportUnmatched" style="height:auto;min-height:56px">预览后显示未匹配明细。</div><div class="tms-section-header">导入预览明细</div><div id="leadImportPreviewRows" class="finput tms-form-control" style="height:auto;min-height:56px">预览后显示数据明细。</div>`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-default" id="leadImportPreviewBtn" onclick="rerunLeadImportPreview()">开始预览</button><button class="tms-btn tms-btn-primary" id="leadImportCommitBtn" onclick="runLeadImportCommit()" disabled>确认导入</button>`;
  openStandardModal({title:'线索导入预览',bodyHtml:body,actionsHtml:actions,extraClass:'modal-wide'});
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
  await runStandardMutation('leadImportCommitBtn',async()=>{
    const batchKey=[leadImportState.fileName,leadImportState.fileSize,leadImportState.fileModified].join(':');
    return apiCall('POST','/leads/import-commit',{batchKey,rows:leadImportState.previewRows});
  },{
    loadingText:'导入中…',
    errorPrefix:'导入失败',
    closeOnSuccess:true,
    onSuccess:(res={})=>{
    renderLeads();
    toast(`导入完成：线索 ${res.leadCount||0} 条，跟进 ${res.followupCount||0} 条`,'success');
      refreshLeadRuntimeInBackground({withStudents:true,withCourts:true},renderLeads);
    }
  });
}
async function convertLeadToStudent(leadId){
  const lead=leadById(leadId);
  if(!lead)return;
  if(lead.studentId){toast('该线索已关联学员','warn');return;}
  if(!await appConfirm(`确认把「${leadDisplayName(lead)}」转为学员？`,{title:'转为学员',confirmText:'确认转化'}))return;
  await runStandardMutation('leadConvertStudentBtn',async()=>{
    const res=await apiCall('POST',`/leads/${leadId}/convert-student`,{});
    if(res?.lead)upsertLeadLocal(res.lead);
    if(res?.student)upsertLeadStudentLocal(res.student);
    return res;
  },{
    loadingText:'转化中...',
    errorPrefix:'转化失败',
    successText:'已转为学员 ✓',
    onSuccess:()=>{
      renderLeads();
      openLeadDetail(leadId);
      refreshLeadRuntimeInBackground({withStudents:true},()=>{
        renderLeads();
        reopenLeadDetailIfStillOpen(leadId);
      });
    }
  });
}
function upsertLeadStudentLocal(student){
  const id=String(student?.id||student?.studentId||'').trim();
  if(!id)return '';
  const next={...student,id};
  const idx=students.findIndex(item=>String(item?.id||'')===id);
  students=idx>=0?students.map((item,index)=>index===idx?{...item,...next}:item):[next,...students];
  return id;
}
function upsertLeadLocal(lead){
  const id=String(lead?.id||lead?.leadId||'').trim();
  if(!id)return;
  const next={...lead,id};
  leads=leads.some(item=>String(item?.id||'')===id)?leads.map(item=>String(item?.id||'')===id?{...item,...next}:item):[next,...leads];
}
function upsertLeadFollowupLocal(followup){
  const id=String(followup?.id||'').trim();
  if(!id)return;
  const next={...followup,id};
  leadFollowups=leadFollowups.some(item=>String(item?.id||'')===id)?leadFollowups.map(item=>String(item?.id||'')===id?{...item,...next}:item):[next,...leadFollowups];
  if(followup?.leadId&&typeof loadedLeadFollowupDetailIds!=='undefined')loadedLeadFollowupDetailIds.add(String(followup.leadId));
}
function upsertLeadCourtLocal(court){
  const id=String(court?.id||court?.courtId||'').trim();
  if(!id)return '';
  const next={...court,id};
  courts=courts.some(item=>String(item?.id||'')===id)?courts.map((item)=>String(item?.id||'')===id?{...item,...next}:item):[next,...courts];
  return id;
}
async function convertLeadToStudentAndPurchase(leadId){
  const lead=leadById(leadId);
  if(!lead)return;
  if(lead.studentId){await openLeadPurchasePackage(leadId);return;}
  if(!await appConfirm(`确认给「${leadDisplayName(lead)}」创建学员档案并继续购买课包？`,{title:'创建学员档案',confirmText:'创建并购买'}))return;
  await runStandardMutation('leadConvertStudentPurchaseBtn',async()=>{
    const res=await apiCall('POST',`/leads/${leadId}/convert-student`,{});
    if(res?.lead)upsertLeadLocal(res.lead);
    let studentId=upsertLeadStudentLocal(res?.student)||res?.student?.id||leadById(leadId)?.studentId||'';
    studentId=upsertLeadStudentLocal(res?.student)||studentId||leadById(leadId)?.studentId||'';
    renderLeads();
    if(!studentId)throw new Error('学员档案创建失败');
    openPurchaseModal(studentId);
    refreshLeadRuntime({withStudents:true}).then(()=>renderLeads()).catch(e=>console.warn('lead runtime refresh skipped after student conversion',e));
  },{
    loadingText:'创建中...',
    errorPrefix:'创建学员失败'
  });
}
async function convertLeadToCourt(leadId){
  const lead=leadById(leadId);
  if(!lead)return;
  if(lead.courtId){toast('该线索已关联订场用户','warn');return;}
  if(!await appConfirm(`确认把「${leadDisplayName(lead)}」转为订场用户？`,{title:'转为订场用户',confirmText:'确认转化'}))return;
  await runStandardMutation('leadConvertCourtBtn',async()=>{
    const res=await apiCall('POST',`/leads/${leadId}/convert-court`,{});
    if(res?.lead)upsertLeadLocal(res.lead);
    if(res?.court)upsertLeadCourtLocal(res.court);
    return res;
  },{
    loadingText:'转化中...',
    errorPrefix:'转化失败',
    successText:'已转为订场用户 ✓',
    onSuccess:()=>{
      renderLeads();
      openLeadDetail(leadId);
      refreshLeadRuntimeInBackground({withCourts:true},()=>{
        renderLeads();
        reopenLeadDetailIfStillOpen(leadId);
      });
    }
  });
}
function openLeadMembershipNextStep(leadId){
  const lead=leadById(leadId);
  if(!lead)return;
  if(!lead.courtId){toast('请先创建或关联订场用户档案','warn');return;}
  if(typeof goPage==='function')goPage('memberships');
  setTimeout(()=>{
    if(typeof openCourtMembershipPanel==='function')openCourtMembershipPanel(lead.courtId,{tab:'overview'});
  },0);
}
function openLeadLinkStudentModal(leadId){
  if(document.getElementById('overlay')?.dataset.leadDetailId){
    startLeadConversionDrawerMode(leadId,'link-student');
    return;
  }
  const lead=leadById(leadId);
  if(!lead)return;
  const body=`<div class="tms-section-header" style="margin-top:0;">关联已有学员</div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">线索</label><input class="finput tms-form-control" value="${esc(leadDisplayName(lead))}" readonly></div></div>${leadConversionLinkFormHtml(lead,'link-student',{modal:true})}`;
  const actions='';
  openStandardModal({title:'关联已有学员',bodyHtml:body,actionsHtml:actions,extraClass:'modal-tight'});
}
async function saveLeadLinkStudent(leadId){
  const studentId=document.getElementById('lead_link_student_id')?.value||'';
  if(!studentId){toast('请选择学员','warn');return;}
  await runStandardMutation('leadLinkStudentBtn',async()=>{
    const res=await apiCall('POST',`/leads/${leadId}/link-student`,{studentId});
    if(res?.lead)upsertLeadLocal(res.lead);
    if(res?.student)upsertLeadStudentLocal(res.student);
    return res;
  },{
    loadingText:'关联中…',
    errorPrefix:'关联失败',
    successText:'学员关联已保存 ✓',
    onSuccess:()=>{
      renderLeads();
      leadDetailConversionMode='';
      openLeadDetail(leadId);
      refreshLeadRuntimeInBackground({withStudents:true},()=>{
        renderLeads();
        reopenLeadDetailIfStillOpen(leadId);
      });
    }
  });
}
function openLeadLinkCourtModal(leadId){
  if(document.getElementById('overlay')?.dataset.leadDetailId){
    startLeadConversionDrawerMode(leadId,'link-court');
    return;
  }
  const lead=leadById(leadId);
  if(!lead)return;
  const body=`<div class="tms-section-header" style="margin-top:0;">关联已有订场用户</div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">线索</label><input class="finput tms-form-control" value="${esc(leadDisplayName(lead))}" readonly></div></div>${leadConversionLinkFormHtml(lead,'link-court',{modal:true})}`;
  const actions='';
  openStandardModal({title:'关联已有订场用户',bodyHtml:body,actionsHtml:actions,extraClass:'modal-tight'});
}
async function saveLeadLinkCourt(leadId){
  const courtId=document.getElementById('lead_link_court_id')?.value||'';
  if(!courtId){toast('请选择订场用户','warn');return;}
  await runStandardMutation('leadLinkCourtBtn',async()=>{
    const res=await apiCall('POST',`/leads/${leadId}/link-court`,{courtId});
    if(res?.lead)upsertLeadLocal(res.lead);
    if(res?.court)upsertLeadCourtLocal(res.court);
    return res;
  },{
    loadingText:'关联中…',
    errorPrefix:'关联失败',
    successText:'订场关联已保存 ✓',
    onSuccess:()=>{
      renderLeads();
      leadDetailConversionMode='';
      openLeadDetail(leadId);
      refreshLeadRuntimeInBackground({withCourts:true},()=>{
        renderLeads();
        reopenLeadDetailIfStillOpen(leadId);
      });
    }
  });
}
function openLeadConvertModal(leadId){
  leadDetailActiveTab='conversion';
  leadDetailEditingSection='';
  leadDetailEditingFollowupId='';
  leadDetailConversionMode='';
  openLeadDetail(leadId);
}
function jumpToLeadDetail(leadId){
  if(!leadId)return;
  if(currentPage!=='leads')goPage('leads');
  setTimeout(()=>openLeadDetail(leadId),120);
}
function leadHasActiveSearchOrFilter(){
  return !!((document.getElementById('leadSearch')?.value||'').trim()||document.getElementById('leadSourceFilter')?.value||document.getElementById('leadCustomerTypeFilter')?.value||document.getElementById('leadConsultFilter')?.value||document.getElementById('leadStageFilter')?.value||document.getElementById('leadDealTypeFilter')?.value||document.getElementById('leadOwnerFilter')?.value||campus!=='all');
}
function leadEmptyStateHtml(){
  const filtered=leadHasActiveSearchOrFilter();
  const title=filtered?'没有匹配的线索':'暂无线索';
  const desc=filtered?'调整搜索或筛选后再试':'点击右上角新增线索开始录入';
  return `<tr><td colspan="15"><div class="tms-empty-state"><div class="tms-empty-title">${title}</div><div class="tms-empty-desc">${desc}</div></div></td></tr>`;
}
function renderLeadMobileCards(list){
  const host=document.getElementById('leadMobileCards');
  if(!host)return;
  if(!list.length){
    const filtered=leadHasActiveSearchOrFilter();
    host.innerHTML=`<div class="tms-empty-state"><div class="tms-empty-title">${filtered?'没有匹配的线索':'暂无线索'}</div><div class="tms-empty-desc">${filtered?'调整搜索或筛选后再试':'点击右下角新增线索开始录入'}</div></div>`;
    return;
  }
  host.innerHTML=list.map(lead=>{
    const trialDate=leadTrialDateText(lead);
    return `<article class="admin-h5-list-card admin-h5-lead-card">
      <div class="admin-h5-card-head">
        <div><strong>${esc(leadWechatText(lead))}</strong><span>${esc(leadDateDisplayText(lead))}</span></div>
        ${renderLeadTag(leadStageDisplayText(lead),'stage')}
      </div>
      <div class="admin-h5-card-tags">${renderLeadTag(leadCustomerTypeText(lead),'customerType')}${renderLeadTag(leadDemandProductText(lead),'demandProduct')}${renderLeadPriorityCell(lead)}</div>
      <div class="admin-h5-card-grid">
        <span><b>来源</b>${esc(leadSourceText(lead)||'-')}</span>
        <span><b>跟进人</b>${esc(leadOwnerText(lead))}</span>
        <span><b>体验课</b>${esc(trialDate||'-')}</span>
        <span><b>成交教练</b>${esc(leadFormalCoachText(lead))}</span>
      </div>
      <p>${esc(leadProfileText(lead)||'暂无基本信息')}</p>
      <div class="admin-h5-card-actions"><button type="button" onclick="openLeadDetailFromList('${lead.id}')">查看</button><button type="button" onclick="openLeadFollowupFromList('${lead.id}')">跟进</button></div>
    </article>`;
  }).join('');
}
function renderLeadPagerControls(total,pages){
  const pager=document.querySelector('#page-leads .tms-pagination');
  if(document.body.classList.contains('admin-mobile')){
    if(pager)pager.style.display='none';
    return;
  }
  if(pager)pager.style.display=total>leadPageSize?'flex':'none';
  const pageSizeHost=document.getElementById('leadPageSize');
  if(pageSizeHost)pageSizeHost.innerHTML=renderPageSizeSelectorHtml('leadPageSizeValue',leadPageSize,'setLeadPageSize');
  const btns=document.getElementById('leadPagerBtns');
  if(!btns)return;
  btns.innerHTML=(!total||pages<=1)?'':renderStandardPaginationButtonsHtml(leadPage,pages,'setLeadPage');
}
function leadCurrentServerPageData(){
  if(typeof leadListPageData!=='object'||!leadListPageData||!Array.isArray(leadListPageData.rows))return null;
  return {
    total:Number(leadListPageData.total)||0,
    page:Number(leadListPageData.page)||leadPage||1,
    pageSize:Number(leadListPageData.pageSize)||leadPageSize,
    pages:Number(leadListPageData.pages)||1
  };
}
async function reloadLeadsForCurrentPage({showLoading=true,refreshStats=true}={}){
  const seq=++leadListReloadSeq;
  leadListReloading=true;
  if(showLoading){
    if(refreshStats)renderLeadStatsLoading();
    if(refreshStats&&typeof renderLeadTableLoading==='function')renderLeadTableLoading();
    else if(typeof renderTableSkeletonLoading==='function')renderTableSkeletonLoading('leadTbody',15,'线索数据加载中...');
  }
  try{
    if(typeof ensureDatasetsByName==='function')await ensureDatasetsByName(['leads'],{force:true});
    if(seq===leadListReloadSeq)renderLeads();
    return true;
  }catch(e){
    if(seq===leadListReloadSeq){
      const message=e?.message||'线索加载失败，请稍后重试';
      if(typeof renderLeadTableError==='function')renderLeadTableError(message);
      else if(typeof toast==='function')toast(message,'error');
    }
    return false;
  }finally{
    if(seq===leadListReloadSeq)leadListReloading=false;
  }
}
function setLeadPage(value){
  const total=leadCurrentServerPageData()?.total??getFilteredLeads().length;
  leadPage=standardListPagination(total,value,leadPageSize).page;
  reloadLeadsForCurrentPage({refreshStats:false});
}
function jumpLeadPage(value){
  const total=leadCurrentServerPageData()?.total??getFilteredLeads().length;
  leadPage=standardListPagination(total,value,leadPageSize).page;
  reloadLeadsForCurrentPage({refreshStats:false});
}
function renderLeads(){
  if(!leadListReloading&&typeof datasetHasCurrentRequestKey==='function'&&!datasetHasCurrentRequestKey('leads')&&typeof ensureDatasetsByName==='function'){
    reloadLeadsForCurrentPage();
    return;
  }
  renderLeadDateScopeControls();
  renderLeadToolbarFilters();
  updateLeadSortHeaders();
  const list=getSortedLeads(getFilteredLeads());
  renderLeadStats(list);
  const isMobileList=document.body.classList.contains('admin-mobile');
  const serverPage=leadCurrentServerPageData();
  const pageState=isMobileList?{total:serverPage?.total??list.length,pages:1,slice:list,page:1}:(serverPage?{total:serverPage.total,pages:serverPage.pages,slice:list,page:serverPage.page}:standardListSlice(list,leadPage,leadPageSize));
  leadPage=pageState.page;
  const {total,pages,slice}=pageState;
  const tbody=document.getElementById('leadTbody');
  if(!tbody)return;
  tbody.innerHTML=slice.length?slice.map(lead=>{
    const trialDate=leadTrialDateText(lead);
    return `<tr><td class="tms-sticky-l" style="padding-left:20px"><div class="tms-text-primary">${esc(leadWechatText(lead))}</div></td><td>${renderStandardCellText(leadDateDisplayText(lead),leadDateDisplayText(lead)==='-')}</td><td>${renderStandardCellText(leadSourceText(lead),false)}</td><td>${renderLeadTag(leadCustomerTypeText(lead),'customerType')}</td><td>${renderLeadTag(leadDemandProductText(lead),'demandProduct')}</td><td>${renderStandardCellText(leadLevelText(lead),leadLevelText(lead)==='-')}</td><td>${renderStandardTooltipText(leadProfileText(lead))}</td><td>${renderLeadTag(leadStageDisplayText(lead),'stage')}</td><td>${renderStandardCellText(lead?.intentLevel,false)}</td><td>${renderLeadPriorityCell(lead)}</td><td>${renderStandardCellText(leadOwnerText(lead),leadOwnerText(lead)==='-')}</td><td>${renderStandardCellText(trialDate,trialDate==='-')}</td><td>${renderStandardCellText(leadFormalCoachText(lead),leadFormalCoachText(lead)==='-')}</td><td>${renderStandardTooltipText(lead?.lostReason||'')}</td><td class="tms-sticky-r tms-action-cell" style="width:90px;padding-right:20px"><span class="tms-action-link" onclick="openLeadDetailFromList('${lead.id}')">查看</span><span class="tms-action-link" onclick="openLeadFollowupFromList('${lead.id}')">跟进</span></td></tr>`;
  }).join(''):leadEmptyStateHtml();
  renderLeadMobileCards(slice);
  const info=document.getElementById('leadPagerInfo');
  if(info)info.innerHTML=renderPagerInfoHtml(total);
  renderLeadPagerControls(total,pages);
}
function applyLeadSearch(){
  leadPage=standardListFirstPage();
  reloadLeadsForCurrentPage();
}
function onLeadFilterChange(){
  leadPage=standardListFirstPage();
  reloadLeadsForCurrentPage();
}
function resetLeadFilters(){
  const ids=['leadSearch','leadSourceFilter','leadCustomerTypeFilter','leadConsultFilter','leadStageFilter','leadOwnerFilter'];
  ids.forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  leadDatePreset='all';
  leadDateCustomStart='';
  leadDateCustomEnd='';
  leadPage=standardListFirstPage();
  reloadLeadsForCurrentPage();
}
function setLeadPageSize(value){
  leadPageSize=standardListPageSize(value,leadPageSize);
  leadPage=standardListFirstPage();
  reloadLeadsForCurrentPage({refreshStats:false});
}
