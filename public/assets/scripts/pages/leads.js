let leadImportState={fileName:'',fileSize:0,fileModified:0,csvText:'',previewRows:[],summary:null,error:''};
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
function leadWechatText(lead){
  return String(lead?.wechatName||lead?.displayName||'-').trim()||'-';
}
function leadRows(){
  const rows=leadRawRows();
  const seen=new Set();
  return [...rows].sort((a,b)=>{
    const updatedDiff=leadSortDateValue(b?.updatedAt||b?.lastFollowupAt||b?.leadDate||b?.createdAt||'')-leadSortDateValue(a?.updatedAt||a?.lastFollowupAt||a?.leadDate||a?.createdAt||'');
    if(updatedDiff!==0)return updatedDiff;
    return String(b?.id||'').localeCompare(String(a?.id||''));
  }).filter(item=>{
    const key=leadDedupKey(item);
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
}
function leadFollowupRows(leadId){
  const seen=new Set();
  return (Array.isArray(leadFollowups)?leadFollowups:[])
    .filter(item=>item?.leadId===leadId)
    .sort((a,b)=>String(b?.followupAt||b?.createdAt||'').localeCompare(String(a?.followupAt||a?.createdAt||'')))
    .filter(item=>{
      const key=[
        leadDedupDate(item?.followupAt||item?.createdAt),
        leadDedupText(item?.followupBy),
        leadDedupText(item?.followupType),
        leadDedupText(item?.communicationNote),
        leadDedupText(item?.concern),
        leadDedupText(item?.conclusion),
        leadDedupText(item?.statusAfter),
        leadDedupDate(item?.nextFollowupAt),
        leadDedupText(item?.nextAction)
      ].join('|');
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    });
}
function leadById(leadId){
  return leadRawRows().find(item=>String(item?.id||'')===String(leadId))||null;
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
  const latest=leadFollowupRows(lead?.id)[0]||null;
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
  return leadFollowupRows(lead?.id).length;
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
  const rows=leadRows();
  const sourceValue=document.getElementById('leadSourceFilter')?.value||'';
  const consultValue=document.getElementById('leadConsultFilter')?.value||'';
  const statusValue=document.getElementById('leadStatusFilter')?.value||'';
  const convertedValue=document.getElementById('leadConvertedFilter')?.value||'';
  const ownerValue=document.getElementById('leadOwnerFilter')?.value||'';
  const sourceOptions=withStandardFilterCounts([{value:'',label:'全部',emptyDisplay:'来源'},...Array.from(new Set(rows.map(item=>String(item?.source||'').trim()).filter(Boolean))).map(value=>({value,label:value}))],rows,(lead,value)=>String(lead?.source||'')===String(value));
  const consultOptions=withStandardFilterCounts([{value:'',label:'全部',emptyDisplay:'咨询需求'},...Array.from(new Set(rows.map(item=>String(item?.consultType||'').trim()).filter(Boolean))).map(value=>({value,label:value}))],rows,(lead,value)=>String(lead?.consultType||'')===String(value));
  const statusValues=leadStatusOptionValues(rows);
  const statusOptions=withStandardFilterCounts([{value:'',label:'全部',emptyDisplay:'状态'},...statusValues.map(value=>({value,label:value}))],rows,(lead,value)=>leadFollowupStatusText(lead)===String(value));
  const convertedOptions=withStandardFilterCounts([{value:'',label:'全部',emptyDisplay:'是否转化'},{value:'是',label:'是'},{value:'否',label:'否'}],rows,(lead,value)=>leadConvertedYesNo(lead)===String(value));
  const ownerOptions=withStandardFilterCounts([{value:'',label:'全部',emptyDisplay:'跟进人'},...Array.from(new Set(rows.map(item=>String(item?.owner||'').trim()).filter(Boolean))).map(value=>({value,label:value}))],rows,(lead,value)=>String(lead?.owner||'')===String(value));
  const configs=[
    ['leadSourceFilterHost','leadSourceFilter','全部来源',sourceOptions,sourceValue],
    ['leadConsultFilterHost','leadConsultFilter','全部咨询需求',consultOptions,consultValue],
    ['leadStatusFilterHost','leadStatusFilter','全部状态',statusOptions,statusValue],
    ['leadConvertedFilterHost','leadConvertedFilter','全部是否转化',convertedOptions,convertedValue],
    ['leadOwnerFilterHost','leadOwnerFilter','全部跟进人',ownerOptions,ownerValue]
  ];
  configs.forEach(([hostId,id,label,options,value])=>{
    const host=document.getElementById(hostId);
    if(host)host.innerHTML=renderCourtDropdownHtml(id,label,options,value,false,'onLeadFilterChange');
  });
}
function renderLeadStats(list){
  const base=Array.isArray(list)?list:[];
  const cardData=[
    ['新线索',base.filter(item=>leadSystemStatusText(item)==='新线索').length],
    ['今日待跟进',base.filter(item=>String(item?.nextFollowupAt||'').slice(0,10)===today()&&leadSystemStatusText(item)!=='已流失').length],
    ['已逾期未跟进',base.filter(item=>leadNeedsFollowup(item)&&String(item?.nextFollowupAt||'').slice(0,10)<today()).length],
    ['已转课程',base.filter(item=>leadConversionText(item)==='已转课程'||leadConversionText(item)==='已转课程+订场').length],
    ['已转订场',base.filter(item=>leadConversionText(item)==='已转订场'||leadConversionText(item)==='已转课程+订场').length],
    ['已流失',base.filter(item=>leadSystemStatusText(item)==='已流失').length]
  ];
  const host=document.getElementById('leadStatsRow');
  if(host)host.innerHTML=cardData.map(([label,value])=>`<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`).join('');
}
function leadTimelineHtml(lead){
  const rows=leadFollowupRows(lead?.id);
  if(!rows.length)return '<div class="empty"><p>暂无跟进时间线</p></div>';
  return `<div class="lead-timeline-list">${rows.map(item=>`<div class="lead-timeline-item">${esc(leadTimelineLineText(item))}</div>`).join('')}</div>`;
}
function leadTimelineLineText(item){
  const date=String(item?.followupAt||item?.createdAt||'').slice(0,10)||'-';
  const by=String(item?.followupBy||'未填写').trim()||'未填写';
  const status=leadFollowupConvertedText(item);
  const note=String(item?.communicationNote||item?.conclusion||'-').trim()||'-';
  return `${date}@${by}${status} ${note}`;
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
  return `<div class="tms-detail-field"><div class="tms-detail-label">${esc(label)}</div><div class="tms-detail-value">${esc(renderCourtEmptyText(value))}</div></div>`;
}
function leadDetailIsEmptyHtml(html){
  const text=String(html||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').trim();
  return !text||['-','暂无跟进时间线','暂无线索详情'].includes(text);
}
function leadDetailBlockHtml(label,html,options={}){
  if(options.hideEmpty&&leadDetailIsEmptyHtml(html))return '';
  return `<div class="tms-detail-field full-width"><div class="tms-detail-label">${esc(label)}</div><div class="tms-detail-block">${html||'-'}</div></div>`;
}
function leadDetailSectionHtml(title,content,first=false){
  return content?`<div class="tms-section-header"${first?' style="margin-top:0;"':''}>${title}</div><div class="tms-detail-grid">${content}</div>`:'';
}
function openLeadDetail(leadId){
  const lead=leadById(leadId);
  if(!lead)return;
  const body=`
    ${leadDetailSectionHtml('基础信息',`
      ${leadDetailFieldHtml('微信名',leadWechatText(lead))}
      ${leadDetailFieldHtml('电话',lead?.phone||'-')}
      ${leadDetailFieldHtml('线索时间',lead?.leadDate||'-')}
      ${leadDetailFieldHtml('水平',leadLevelText(lead))}
      ${leadDetailFieldHtml('来源',lead?.source||'-')}
      ${leadDetailFieldHtml('所属校区',leadCampusText(lead))}
      ${leadDetailFieldHtml('咨询需求',lead?.consultType||'-')}
      ${leadDetailFieldHtml('意向类型',lead?.intentLevel||'-')}
      ${leadDetailBlockHtml('基本信息',esc(leadProfileText(lead)),{hideEmpty:true})}
    `,true)}
    ${leadDetailSectionHtml('当前跟进',`
      ${leadDetailFieldHtml('跟进人',lead?.owner||'-')}
      ${leadDetailFieldHtml('跟进次数',String(leadFollowupCount(lead)))}
      ${leadDetailFieldHtml('当前状态',leadSystemStatusText(lead))}
      ${leadDetailFieldHtml('最近跟进',lead?.lastFollowupAt?fmtDt(lead.lastFollowupAt):'-')}
      ${leadDetailFieldHtml('转化结果',leadConversionText(lead))}
      ${leadDetailFieldHtml('正式课教练',lead?.formalCoach||'-')}
      ${leadDetailBlockHtml('沟通情况',renderLeadCommunicationBlock(leadCommunicationText(lead)),{hideEmpty:true})}
      ${leadDetailBlockHtml('用户顾虑',esc(lead?.latestConcern||'-'),{hideEmpty:true})}
      ${leadDetailBlockHtml('下一步动作',esc(lead?.nextAction||'-'),{hideEmpty:true})}
    `)}
    ${leadDetailSectionHtml('跟进时间线',`<div class="tms-detail-field full-width"><div class="tms-detail-block">${leadTimelineHtml(lead)}</div></div>`)}
    ${leadDetailSectionHtml('转化关系',`
      ${leadDetailFieldHtml('学员关联',linkedStudentName(lead))}
      ${leadDetailFieldHtml('订场关联',linkedCourtName(lead))}
      ${leadDetailFieldHtml('未成交原因',lead?.lostReason||'-')}
    `)}
  `;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">关闭</button><button class="tms-btn tms-btn-default" onclick="openLeadFollowupModal('${lead.id}')">新增跟进</button><button class="tms-btn tms-btn-default" onclick="openLeadModal('${lead.id}')">编辑线索</button><button class="tms-btn tms-btn-default" onclick="convertLeadToStudent('${lead.id}')">转为学员</button><button class="tms-btn tms-btn-default" onclick="convertLeadToCourt('${lead.id}')">转为订场用户</button><button class="tms-btn tms-btn-default" onclick="openLeadLinkStudentModal('${lead.id}')">关联已有学员</button><button class="tms-btn tms-btn-primary" onclick="openLeadLinkCourtModal('${lead.id}')">关联已有订场用户</button>`;
  setCourtModalFrame('线索详情',body,actions,'modal-wide');
}
function openLeadModal(leadId){
  const lead=leadById(leadId)||null;
  const intentOptions=[{value:'',label:'-'},{value:'高',label:'高'},{value:'中',label:'中'},{value:'低',label:'低'}];
  const statusOptions=[{value:'新线索',label:'新线索'},{value:'跟进中',label:'跟进中'},{value:'已约体验',label:'已约体验'},{value:'已转课程',label:'已转课程'},{value:'已转订场',label:'已转订场'},{value:'已转课程+订场',label:'已转课程+订场'},{value:'已流失',label:'已流失'}];
  const campusValue=lead?.campus||(campus!=='all'?campus:'mabao');
  const body=`<div class="tms-section-header" style="margin-top:0;">基础信息</div><div class="tms-form-row lead-form-row-4"><div class="tms-form-item"><label class="tms-form-label">姓名 / 称呼</label><input class="finput tms-form-control" id="lead_displayName" value="${esc(lead?.displayName||'')}"></div><div class="tms-form-item"><label class="tms-form-label">手机号</label><input class="finput tms-form-control" id="lead_phone" value="${esc(lead?.phone||'')}"></div><div class="tms-form-item"><label class="tms-form-label">微信名</label><input class="finput tms-form-control" id="lead_wechatName" value="${esc(lead?.wechatName||'')}"></div><div class="tms-form-item"><label class="tms-form-label">线索时间</label>${courtDateButtonHtml('lead_leadDate',lead?.leadDate||today(),'线索时间')}</div></div><div class="tms-form-row lead-form-row-4"><div class="tms-form-item"><label class="tms-form-label">线索渠道</label>${renderCourtDropdownHtml('lead_source','线索渠道',[{value:'',label:'-'},...leadSourceOptions()],lead?.source||'',true)}</div><div class="tms-form-item"><label class="tms-form-label">所属校区</label>${renderCourtDropdownHtml('lead_campus','所属校区',leadCampusOptions(),campusValue,true)}</div><div class="tms-form-item"><label class="tms-form-label">咨询需求</label>${renderCourtDropdownHtml('lead_consultType','咨询需求',[{value:'',label:'-'},...leadConsultOptions()],lead?.consultType||'',true)}</div><div class="tms-form-item"><label class="tms-form-label">意向</label>${renderCourtDropdownHtml('lead_intentLevel','意向',intentOptions,lead?.intentLevel||'',true)}</div></div><div class="tms-form-row lead-form-row-4"><div class="tms-form-item"><label class="tms-form-label">跟进人</label>${renderCourtDropdownHtml('lead_owner','跟进人',[{value:'',label:'-'},...leadOwnerOptions()],lead?.owner||currentUser?.name||'',true)}</div><div class="tms-form-item"><label class="tms-form-label">当前状态</label>${renderCourtDropdownHtml('lead_systemStatus','当前状态',statusOptions,leadSystemStatusText(lead),true)}</div><div class="tms-form-item"></div><div class="tms-form-item"></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">其他信息</label><textarea class="finput tms-form-control" id="lead_profileNote">${esc(lead?.profileNote||'')}</textarea></div></div>`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" id="leadSaveBtn" onclick="saveLead('${leadId||''}')">保存</button>`;
  setCourtModalFrame(leadId?'编辑线索':'新增线索',body,actions,'modal-wide modal-leads-form');
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
  const displayName=document.getElementById('lead_displayName')?.value?.trim?.()||'';
  const phone=document.getElementById('lead_phone')?.value?.trim?.()||'';
  if(!displayName){toast('请填写姓名或称呼','warn');return;}
  if(!leadPhoneValid(phone)){toast('手机号格式不正确','warn');return;}
  const btn=document.getElementById('leadSaveBtn');
  if(btn){btn.disabled=true;btn.textContent='保存中…';}
  const payload={
    displayName,
    phone,
    wechatName:document.getElementById('lead_wechatName')?.value?.trim?.()||'',
    leadDate:document.getElementById('lead_leadDate')?.value||today(),
    source:document.getElementById('lead_source')?.value||'',
    campus:document.getElementById('lead_campus')?.value||'',
    consultType:document.getElementById('lead_consultType')?.value||'',
    intentLevel:document.getElementById('lead_intentLevel')?.value||'',
    owner:document.getElementById('lead_owner')?.value||'',
    rawStatus:document.getElementById('lead_systemStatus')?.value||'跟进中',
    systemStatus:document.getElementById('lead_systemStatus')?.value||'跟进中',
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
function openLeadFollowupModal(leadId){
  const lead=leadById(leadId)||null;
  const followupTypeOptions=[{value:'电话',label:'电话'},{value:'微信',label:'微信'},{value:'到店',label:'到店'},{value:'面谈',label:'面谈'},{value:'其他',label:'其他'}];
  const statusOptions=[{value:'新线索',label:'新线索'},{value:'跟进中',label:'跟进中'},{value:'已约体验',label:'已约体验'},{value:'已转课程',label:'已转课程'},{value:'已转订场',label:'已转订场'},{value:'已转课程+订场',label:'已转课程+订场'},{value:'已流失',label:'已流失'}];
  const body=`<div class="tms-section-header" style="margin-top:0;">新增跟进</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">跟进时间</label><input type="datetime-local" class="finput tms-form-control" id="lead_followupAt" value="${esc(leadNowInputValue())}"></div><div class="tms-form-item"><label class="tms-form-label">跟进人</label><input class="finput tms-form-control" id="lead_followupBy" value="${esc(currentUser?.name||lead?.owner||'')}"></div><div class="tms-form-item"><label class="tms-form-label">跟进方式</label>${renderCourtDropdownHtml('lead_followupType','跟进方式',followupTypeOptions,'电话',true)}</div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">沟通内容</label><textarea class="finput tms-form-control" id="lead_communicationNote"></textarea></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">用户顾虑</label><textarea class="finput tms-form-control" id="lead_concern"></textarea></div><div class="tms-form-item"><label class="tms-form-label">本次结论</label><textarea class="finput tms-form-control" id="lead_conclusion"></textarea></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">当前状态</label>${renderCourtDropdownHtml('lead_statusAfter','当前状态',statusOptions,leadSystemStatusText(lead),true)}</div><div class="tms-form-item"><label class="tms-form-label">下次跟进时间</label>${courtDateButtonHtml('lead_nextFollowupAt',lead?.nextFollowupAt||'','下次跟进时间')}</div><div class="tms-form-item"><label class="tms-form-label">下次动作</label><input class="finput tms-form-control" id="lead_nextAction" value="${esc(lead?.nextAction||'')}"></div></div>`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" id="leadFollowupSaveBtn" onclick="saveLeadFollowup('${leadId}')">保存跟进</button>`;
  setCourtModalFrame('新增跟进',body,actions,'modal-wide');
}
async function saveLeadFollowup(leadId){
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
    await apiCall('POST',`/leads/${leadId}/followups`,payload);
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
  return `<tr><td colspan="17"><div class="tms-empty-state"><div class="tms-empty-title">${title}</div><div class="tms-empty-desc">${desc}</div></div></td></tr>`;
}
function renderLeadPagerControls(total,pages){
  const pager=document.querySelector('#page-leads .tms-pagination');
  if(pager)pager.style.display=total>leadPageSize?'flex':'none';
  const pageSizeHost=document.getElementById('leadPageSize');
  if(pageSizeHost)pageSizeHost.innerHTML=renderCourtDropdownHtml('leadPageSizeValue',`${leadPageSize}条/页`,[{value:'20',label:'20条/页'},{value:'50',label:'50条/页'},{value:'100',label:'100条/页'}],String(leadPageSize),false,'setLeadPageSize');
  const btns=document.getElementById('leadPagerBtns');
  if(!btns)return;
  if(!total||pages<=1){btns.innerHTML='';return;}
  const pageBtns=leadPageNumbers(leadPage,pages).map(item=>item==='...'
    ?'<span class="tms-page-ellipsis">...</span>'
    :`<div class="tms-page-btn${item===leadPage?' active':''}" onclick="leadPage=${item};renderLeads()">${item}</div>`
  ).join('');
  btns.innerHTML=`<div class="tms-page-btn" onclick="leadPage=Math.max(1,leadPage-1);renderLeads()">上一页</div>${pageBtns}<div class="tms-page-btn" onclick="leadPage=Math.min(${pages},leadPage+1);renderLeads()">下一页</div><span class="tms-page-jump">跳至 <input id="leadPageJump" value="${leadPage}" onkeydown="if(event.key==='Enter')jumpLeadPage(this.value)"> 页</span>`;
}
function jumpLeadPage(value){
  const total=getFilteredLeads().length;
  const pages=Math.max(1,Math.ceil(total/leadPageSize));
  leadPage=Math.min(pages,Math.max(1,parseInt(value,10)||1));
  renderLeads();
}
function renderLeads(){
  renderLeadToolbarFilters();
  updateLeadSortHeaders();
  const list=getSortedLeads(getFilteredLeads());
  const total=list.length;
  const pageSize=leadPageSize||20;
  const pages=Math.max(1,Math.ceil(total/pageSize));
  if(leadPage>pages)leadPage=pages;
  const slice=list.slice((leadPage-1)*pageSize,leadPage*pageSize);
  const tbody=document.getElementById('leadTbody');
  if(!tbody)return;
  tbody.innerHTML=slice.length?slice.map(lead=>{
    const trialDate=leadTrialDateText(lead);
    const formalDate=leadFormalSignupDateText(lead);
    return `<tr><td class="tms-sticky-l" style="padding-left:20px">${renderCourtCellText(leadWechatText(lead),false)}</td><td>${renderLeadTag(leadFollowupStatusText(lead),'status')}</td><td>${renderLeadTag(leadConvertedYesNo(lead),'converted')}</td><td>${renderCourtCellText(trialDate,trialDate==='-')}</td><td><div class="tms-text-remark tms-text-remark-1" title="${esc(lead?.lostReason||'')}">${esc(renderCourtEmptyText(lead?.lostReason))}</div></td><td>${renderCourtCellText(lead?.lastFollowupAt?leadRecentDateText(lead.lastFollowupAt):'-',!lead?.lastFollowupAt)}</td><td>${renderCourtCellText(String(leadFollowupCount(lead)||0),false)}</td><td>${renderLeadTag(lead?.intentLevel,'intent')}</td><td>${renderLeadTag(lead?.consultType,'consult')}</td><td><div class="tms-text-remark tms-text-remark-1" title="${esc(leadProfileText(lead))}">${esc(renderCourtEmptyText(leadProfileText(lead)))}</div></td><td>${renderCourtCellText(formalDate,formalDate==='-')}</td><td>${renderCourtCellText(lead?.formalCoach||'-',!lead?.formalCoach)}</td><td>${renderCourtCellText(leadDateOnly(lead?.leadDate,lead)||'-',!lead?.leadDate)}</td><td>${renderLeadTag(lead?.source,'source')}</td><td>${renderCourtCellText(leadCampusText(lead),leadCampusText(lead)==='-')}</td><td>${renderLeadTag(lead?.owner,'owner')}</td><td class="tms-sticky-r tms-action-cell" style="width:150px;padding-right:20px"><span class="tms-action-link" onclick="openLeadDetail('${lead.id}')">查看</span><span class="tms-action-link" onclick="openLeadFollowupModal('${lead.id}')">跟进</span><span class="tms-action-link" onclick="openLeadConvertModal('${lead.id}')">转化</span></td></tr>`;
  }).join(''):leadEmptyStateHtml();
  const info=document.getElementById('leadPagerInfo');
  if(info)info.textContent=`共 ${total} 条`;
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
  leadPage=1;
  renderLeads();
}
function setLeadPageSize(value){
  const next=parseInt(value,10);
  leadPageSize=[20,50,100].includes(next)?next:20;
  leadPage=1;
  renderLeads();
}
