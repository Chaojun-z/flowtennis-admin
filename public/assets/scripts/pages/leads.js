let leadImportState={fileName:'',fileSize:0,fileModified:0,csvText:'',previewRows:[],summary:null,error:''};
function leadWechatText(lead){
  return String(lead?.wechatName||lead?.displayName||'—').trim()||'—';
}
function leadRows(){
  return Array.isArray(leads)?leads:[];
}
function leadFollowupRows(leadId){
  return (Array.isArray(leadFollowups)?leadFollowups:[])
    .filter(item=>item?.leadId===leadId)
    .sort((a,b)=>String(b?.followupAt||b?.createdAt||'').localeCompare(String(a?.followupAt||a?.createdAt||'')));
}
function leadById(leadId){
  return leadRows().find(item=>String(item?.id||'')===String(leadId))||null;
}
function leadDisplayName(lead){
  return String(lead?.displayName||lead?.name||lead?.wechatName||lead?.phone||'未命名线索').trim();
}
function leadSystemStatusText(lead){
  return String(lead?.systemStatus||lead?.rawStatus||'跟进中').trim()||'跟进中';
}
function leadConversionText(lead){
  if(lead?.studentId&&lead?.courtId)return '已转课程+订场';
  if(lead?.studentId||lead?.isCourseConverted)return '已转课程';
  if(lead?.courtId||lead?.isCourtConverted)return '已转订场';
  if(lead?.isMembershipConverted)return '已升级会员';
  return '未转化';
}
function leadCommunicationText(lead){
  const latest=leadFollowupRows(lead?.id)[0]||null;
  return String(latest?.communicationNote||lead?.latestConclusion||'').trim()||'—';
}
function leadCommunicationLines(text){
  const raw=String(text||'').trim();
  if(!raw)return ['—'];
  const normalized=raw
    .replace(/；\s*/g,'\n')
    .replace(/；/g,'\n')
    .replace(/(?<!^)\s*(?=(?:\d{1,2}[月\/.-]\d{1,2}(?:日)?))/g,'\n');
  const lines=normalized.split('\n').map(item=>item.trim()).filter(Boolean);
  return lines.length?lines:['—'];
}
function renderLeadCommunicationBlock(text){
  return leadCommunicationLines(text).map(line=>`<div>${esc(line)}</div>`).join('');
}
function leadProfileText(lead){
  return String(lead?.profileNote||'').trim()||'—';
}
function leadLevelText(lead){
  return String(lead?.level||'').trim()||'—';
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
  if(kind==='source')return text==='大众点评'?'tms-tag-tier-blue':text==='线下到店'?'tms-tag-tier-gold':'tms-tag-tier-slate';
  if(kind==='intent')return /^高/.test(text)?'tms-tag-green':/^中/.test(text)?'tms-tag-tier-blue':/^低/.test(text)?'tms-tag-tier-slate':'tms-tag-tier-slate';
  if(kind==='owner')return 'tms-tag-tier-teal';
  if(kind==='conversion'){
    if(text==='已转课程+订场')return 'tms-tag-tier-gold';
    if(text==='已转课程')return 'tms-tag-green';
    if(text==='已转订场'||text==='已升级会员')return 'tms-tag-tier-blue';
    return 'tms-tag-tier-slate';
  }
  if(kind==='status'){
    if(text==='已流失')return 'tms-tag-tier-slate';
    if(text==='已转课程'||text==='已转订场'||text==='已转课程+订场')return 'tms-tag-green';
    if(text==='已约体验')return 'tms-tag-tier-blue';
    return 'tms-tag-tier-gold';
  }
  return 'tms-tag-tier-slate';
}
function renderLeadTag(value,kind){
  const text=String(value||'').trim()||'—';
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
function leadStudentMatchText(row){
  if(row?.studentMatchType==='auto')return `已自动关联：${row.studentMatchName||row.studentId||'—'}`;
  if(row?.studentMatchType==='possible')return `疑似学员：${row.studentMatchName||'—'}`;
  return '未匹配';
}
function leadCourtMatchText(row){
  if(row?.courtMatchType==='auto')return `已自动关联：${row.courtMatchName||row.courtId||'—'}`;
  if(row?.courtMatchType==='possible')return `疑似订场：${row.courtMatchName||'—'}`;
  return '未匹配';
}
function getFilteredLeads(){
  const q=(document.getElementById('leadSearch')?.value||'').trim().toLowerCase();
  const sourceValue=document.getElementById('leadSourceFilter')?.value||'';
  const consultValue=document.getElementById('leadConsultFilter')?.value||'';
  const statusValue=document.getElementById('leadStatusFilter')?.value||'';
  const ownerValue=document.getElementById('leadOwnerFilter')?.value||'';
  return leadRows().filter(lead=>{
    if(!searchHit(q,leadDisplayName(lead),lead?.phone,lead?.wechatName,lead?.source,lead?.consultType,lead?.owner,lead?.profileNote))return false;
    if(sourceValue&&String(lead?.source||'')!==sourceValue)return false;
    if(consultValue&&String(lead?.consultType||'')!==consultValue)return false;
    if(statusValue&&leadSystemStatusText(lead)!==statusValue)return false;
    if(ownerValue&&String(lead?.owner||'')!==ownerValue)return false;
    return true;
  });
}
function renderLeadToolbarFilters(){
  const rows=leadRows();
  const sourceValue=document.getElementById('leadSourceFilter')?.value||'';
  const consultValue=document.getElementById('leadConsultFilter')?.value||'';
  const statusValue=document.getElementById('leadStatusFilter')?.value||'';
  const ownerValue=document.getElementById('leadOwnerFilter')?.value||'';
  const pageSizeHost=document.getElementById('leadPageSize');
  const sourceOptions=[{value:'',label:'全部来源'},...Array.from(new Set(rows.map(item=>String(item?.source||'').trim()).filter(Boolean))).map(value=>({value,label:value}))];
  const consultOptions=[{value:'',label:'全部咨询需求'},...Array.from(new Set(rows.map(item=>String(item?.consultType||'').trim()).filter(Boolean))).map(value=>({value,label:value}))];
  const statusOptions=[{value:'',label:'全部状态'},{value:'新线索',label:'新线索'},{value:'跟进中',label:'跟进中'},{value:'已约体验',label:'已约体验'},{value:'已转课程',label:'已转课程'},{value:'已转订场',label:'已转订场'},{value:'已转课程+订场',label:'已转课程+订场'},{value:'已流失',label:'已流失'}];
  const ownerOptions=[{value:'',label:'全部跟进人'},...Array.from(new Set(rows.map(item=>String(item?.owner||'').trim()).filter(Boolean))).map(value=>({value,label:value}))];
  const configs=[
    ['leadSourceFilterHost','leadSourceFilter','全部来源',sourceOptions,sourceValue],
    ['leadConsultFilterHost','leadConsultFilter','全部咨询需求',consultOptions,consultValue],
    ['leadStatusFilterHost','leadStatusFilter','全部状态',statusOptions,statusValue],
    ['leadOwnerFilterHost','leadOwnerFilter','全部跟进人',ownerOptions,ownerValue]
  ];
  configs.forEach(([hostId,id,label,options,value])=>{
    const host=document.getElementById(hostId);
    if(host)host.innerHTML=renderCourtDropdownHtml(id,label,options,value,false,'onLeadFilterChange');
  });
  if(pageSizeHost)pageSizeHost.innerHTML=renderCourtDropdownHtml('leadPageSizeValue',`${leadPageSize}条/页`,[{value:'20',label:'20条/页'},{value:'50',label:'50条/页'},{value:'100',label:'100条/页'}],String(leadPageSize),false,'setLeadPageSize');
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
  return `<div class="tms-history-list">${rows.map(item=>`<div class="tms-history-item"><div class="tms-history-title">${esc(fmtDt(item?.followupAt)||'—')} · ${esc(item?.followupBy||'未填写')} · <span class="tms-tag ${leadTagClass('conversion',leadFollowupConvertedText(item))}">${esc(leadFollowupConvertedText(item))}</span></div><div class="tms-text-secondary">${renderLeadCommunicationBlock(item?.communicationNote||'—')}</div></div>`).join('')}</div>`;
}
function linkedStudentName(lead){
  const stu=students.find(item=>String(item?.id||'')===String(lead?.studentId||''));
  return stu?.name||lead?.studentId||'—';
}
function linkedCourtName(lead){
  const court=courts.find(item=>String(item?.id||'')===String(lead?.courtId||''));
  return court?.name||lead?.courtId||'—';
}
function openLeadDetail(leadId){
  const lead=leadById(leadId);
  if(!lead)return;
  const body=`<div class="tms-section-header" style="margin-top:0;">基础信息</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">微信名</label><input class="finput tms-form-control" value="${esc(leadWechatText(lead))}" readonly></div><div class="tms-form-item"><label class="tms-form-label">电话</label><input class="finput tms-form-control" value="${esc(lead?.phone||'—')}" readonly></div><div class="tms-form-item"><label class="tms-form-label">线索时间</label><input class="finput tms-form-control" value="${esc(lead?.leadDate||'—')}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">水平</label><input class="finput tms-form-control" value="${esc(leadLevelText(lead))}" readonly></div><div class="tms-form-item"><label class="tms-form-label">来源</label><input class="finput tms-form-control" value="${esc(lead?.source||'—')}" readonly></div><div class="tms-form-item"><label class="tms-form-label">咨询需求</label><input class="finput tms-form-control" value="${esc(lead?.consultType||'—')}" readonly></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">基本信息</label><div class="finput tms-form-control tms-readonly-text">${esc(leadProfileText(lead))}</div></div></div><div class="tms-section-header">当前跟进</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">跟进人</label><input class="finput tms-form-control" value="${esc(lead?.owner||'—')}" readonly></div><div class="tms-form-item"><label class="tms-form-label">跟进次数</label><input class="finput tms-form-control" value="${esc(String(leadFollowupCount(lead)))}" readonly></div><div class="tms-form-item"><label class="tms-form-label">当前状态</label><input class="finput tms-form-control" value="${esc(leadSystemStatusText(lead))}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">最近跟进</label><input class="finput tms-form-control" value="${esc(lead?.lastFollowupAt?fmtDt(lead.lastFollowupAt):'—')}" readonly></div><div class="tms-form-item"><label class="tms-form-label">转化结果</label><input class="finput tms-form-control" value="${esc(leadConversionText(lead))}" readonly></div><div class="tms-form-item"><label class="tms-form-label">正式课教练</label><input class="finput tms-form-control" value="${esc(lead?.formalCoach||'—')}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">沟通情况</label><div class="finput tms-form-control tms-readonly-text">${renderLeadCommunicationBlock(leadCommunicationText(lead))}</div></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">用户顾虑</label><div class="finput tms-form-control tms-readonly-text">${esc(lead?.latestConcern||'—')}</div></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">下一步动作</label><div class="finput tms-form-control tms-readonly-text">${esc(lead?.nextAction||'—')}</div></div></div><div class="tms-section-header">跟进时间线</div>${leadTimelineHtml(lead)}<div class="tms-section-header">转化关系</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">学员关联</label><input class="finput tms-form-control" value="${esc(linkedStudentName(lead))}" readonly></div><div class="tms-form-item"><label class="tms-form-label">订场关联</label><input class="finput tms-form-control" value="${esc(linkedCourtName(lead))}" readonly></div><div class="tms-form-item"><label class="tms-form-label">未成交原因</label><input class="finput tms-form-control" value="${esc(lead?.lostReason||'—')}" readonly></div></div>`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">关闭</button><button class="tms-btn tms-btn-default" onclick="openLeadFollowupModal('${lead.id}')">新增跟进</button><button class="tms-btn tms-btn-default" onclick="openLeadModal('${lead.id}')">编辑线索</button><button class="tms-btn tms-btn-default" onclick="convertLeadToStudent('${lead.id}')">转为学员</button><button class="tms-btn tms-btn-default" onclick="convertLeadToCourt('${lead.id}')">转为订场用户</button><button class="tms-btn tms-btn-default" onclick="openLeadLinkStudentModal('${lead.id}')">关联已有学员</button><button class="tms-btn tms-btn-primary" onclick="openLeadLinkCourtModal('${lead.id}')">关联已有订场用户</button>`;
  setCourtModalFrame('线索详情',body,actions,'modal-wide');
}
function openLeadModal(leadId){
  const lead=leadById(leadId)||null;
  const intentOptions=[{value:'',label:'-'},{value:'高',label:'高'},{value:'中',label:'中'},{value:'低',label:'低'}];
  const statusOptions=[{value:'新线索',label:'新线索'},{value:'跟进中',label:'跟进中'},{value:'已约体验',label:'已约体验'},{value:'已转课程',label:'已转课程'},{value:'已转订场',label:'已转订场'},{value:'已转课程+订场',label:'已转课程+订场'},{value:'已流失',label:'已流失'}];
  const body=`<div class="tms-section-header" style="margin-top:0;">基础信息</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">姓名 / 称呼</label><input class="finput tms-form-control" id="lead_displayName" value="${esc(lead?.displayName||'')}"></div><div class="tms-form-item"><label class="tms-form-label">手机号</label><input class="finput tms-form-control" id="lead_phone" value="${esc(lead?.phone||'')}"></div><div class="tms-form-item"><label class="tms-form-label">微信名</label><input class="finput tms-form-control" id="lead_wechatName" value="${esc(lead?.wechatName||'')}"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">线索时间</label>${courtDateButtonHtml('lead_leadDate',lead?.leadDate||today(),'线索时间')}</div><div class="tms-form-item"><label class="tms-form-label">线索渠道</label>${renderCourtDropdownHtml('lead_source','线索渠道',[{value:'',label:'-'},...leadSourceOptions()],lead?.source||'',true)}</div><div class="tms-form-item"><label class="tms-form-label">咨询需求</label>${renderCourtDropdownHtml('lead_consultType','咨询需求',[{value:'',label:'-'},...leadConsultOptions()],lead?.consultType||'',true)}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">意向</label>${renderCourtDropdownHtml('lead_intentLevel','意向',intentOptions,lead?.intentLevel||'',true)}</div><div class="tms-form-item"><label class="tms-form-label">跟进人</label>${renderCourtDropdownHtml('lead_owner','跟进人',[{value:'',label:'-'},...leadOwnerOptions()],lead?.owner||currentUser?.name||'',true)}</div><div class="tms-form-item"><label class="tms-form-label">当前状态</label>${renderCourtDropdownHtml('lead_systemStatus','当前状态',statusOptions,leadSystemStatusText(lead),true)}</div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">其他信息</label><textarea class="finput tms-form-control" id="lead_profileNote">${esc(lead?.profileNote||'')}</textarea></div></div>`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" id="leadSaveBtn" onclick="saveLead('${leadId||''}')">保存</button>`;
  setCourtModalFrame(leadId?'编辑线索':'新增线索',body,actions,'modal-wide');
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
  const options=[{value:'',label:'— 选择学员 —'},...students.slice().sort((a,b)=>String(a?.name||'').localeCompare(String(b?.name||''))).map(item=>({value:item.id,label:`${item.name}${item.phone?` · ${item.phone}`:''}`}))];
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
  const options=[{value:'',label:'— 选择订场用户 —'},...courts.slice().sort((a,b)=>String(a?.name||'').localeCompare(String(b?.name||''))).map(item=>({value:item.id,label:`${item.name}${item.phone?` · ${item.phone}`:''}`}))];
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
function renderLeads(){
  renderLeadToolbarFilters();
  const list=getFilteredLeads();
  const total=list.length;
  const pageSize=leadPageSize||20;
  const pages=Math.max(1,Math.ceil(total/pageSize));
  if(leadPage>pages)leadPage=1;
  const slice=list.slice((leadPage-1)*pageSize,leadPage*pageSize);
  const tbody=document.getElementById('leadTbody');
  if(!tbody)return;
  tbody.innerHTML=slice.length?slice.map(lead=>{
    const conversionText=leadConversionText(lead);
    return `<tr><td style="padding-left:20px">${renderCourtCellText(lead?.leadDate||'-',false)}</td><td>${renderCourtCellText(leadWechatText(lead),false)}</td><td>${renderCourtCellText(lead?.phone||'-',false)}</td><td>${renderCourtCellText(leadLevelText(lead),false)}</td><td>${renderLeadTag(lead?.source,'source')}</td><td>${renderCourtCellText(lead?.consultType,false)}</td><td>${renderLeadTag(lead?.intentLevel,'intent')}</td><td><div class="tms-text-remark tms-text-remark-1" title="${esc(leadProfileText(lead))}">${esc(leadProfileText(lead))}</div></td><td>${renderLeadTag(lead?.owner,'owner')}</td><td>${renderCourtCellText(String(leadFollowupCount(lead)||0),false)}</td><td>${renderLeadTag(leadSystemStatusText(lead),'status')}</td><td>${renderCourtCellText(lead?.lastFollowupAt?fmtDt(lead.lastFollowupAt):'-',false)}</td><td>${renderLeadTag(conversionText,'conversion')}</td><td><div class="tms-text-remark tms-text-remark-1" title="${esc(leadCommunicationText(lead))}">${esc(leadCommunicationText(lead))}</div></td><td class="tms-sticky-r tms-action-cell" style="width:150px;padding-right:20px"><span class="tms-action-link" onclick="openLeadDetail('${lead.id}')">查看</span><span class="tms-action-link" onclick="openLeadFollowupModal('${lead.id}')">跟进</span><span class="tms-action-link" onclick="openLeadConvertModal('${lead.id}')">转化</span></td></tr>`;
  }).join(''):'<tr><td colspan="15"><div class="empty"><p>暂无线索</p></div></td></tr>';
  const info=document.getElementById('leadPagerInfo');
  if(info)info.textContent=`共 ${total} 条`;
  const btns=document.getElementById('leadPagerBtns');
  if(btns)btns.innerHTML=pages<=1?'':Array.from({length:pages},(_,index)=>`<div class="tms-page-btn${index+1===leadPage?' active':''}" onclick="leadPage=${index+1};renderLeads()">${index+1}</div>`).join('');
}
function onLeadFilterChange(){
  leadPage=1;
  renderLeads();
}
function setLeadPageSize(value){
  const next=parseInt(value,10)||20;
  leadPageSize=next;
  leadPage=1;
  renderLeads();
}
